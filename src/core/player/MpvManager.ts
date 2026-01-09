import { getPlayerInfoObj } from "@/utils/format";
import { PlaybackStatus } from "@/types/smtc";

export type MpvEventHandlers = {
  onPlayStateChange?: (isPlaying: boolean) => void;
  onTimePos?: (seconds: number) => void;
  onDuration?: (durationMs: number) => void;
  onVolume?: (volume01: number) => void;
  onFileLoaded?: () => void;
  onPlaybackRestart?: () => void;
  onEnded?: (reason: string) => void;
};

/**
 * 封装 MPV 交互与事件，解耦 PlayerController
 */
class MpvManager {
  private handlers: MpvEventHandlers = {};
  /** 当前 loadfile 请求期望自动播放 */
  private autoPlayPending: boolean | null = null;
  /** 当前 loadfile 请求期望 seek（秒） */
  private seekPendingSeconds: number | null = null;
  /** 当前曲目是否已开始播放（playback-restart 后才响应 pause 变化） */
  private playbackStarted: boolean = false;
  /** 在期望暂停的场景下，强制保持 UI 暂停，直到用户主动播放 */
  private forcePaused: boolean = false;

  constructor() {
    if (window?.electron?.ipcRenderer) {
      // 防止重复注册
      window.electron.ipcRenderer.removeAllListeners("mpv-property-change");
      window.electron.ipcRenderer.removeAllListeners("mpv-file-loaded");
      window.electron.ipcRenderer.removeAllListeners("mpv-playback-restart");
      window.electron.ipcRenderer.removeAllListeners("mpv-ended");

      window.electron.ipcRenderer.on(
        "mpv-property-change",
        (_: any, { name, value }: any) => {
          if (value === null || value === undefined) return;
          switch (name) {
            case "time-pos": {
              if (typeof value === "number") this.handlers.onTimePos?.(value);
              break;
            }
            case "pause": {
              if (!this.playbackStarted) break;
              const isPaused = !!value;
              if (this.forcePaused) {
                this.handlers.onPlayStateChange?.(false);
                break;
              }
              this.handlers.onPlayStateChange?.(!isPaused);
              break;
            }
            case "duration":
              if (typeof value === "number") this.handlers.onDuration?.(Math.floor(value * 1000));
              break;
            case "volume":
              if (typeof value === "number") this.handlers.onVolume?.(value / 100);
              break;
          }
        },
      );

      window.electron.ipcRenderer.on("mpv-file-loaded", () => {
        this.handlers.onFileLoaded?.();
        // file-loaded 之后处理 seek 和暂停命令
        if (this.seekPendingSeconds && this.seekPendingSeconds > 0) {
          window.electron.ipcRenderer.send("mpv-seek", this.seekPendingSeconds);
        }
        if (this.autoPlayPending === false) {
          window.electron.ipcRenderer.send("mpv-pause");
          this.forcePaused = true;
          this.handlers.onPlayStateChange?.(false);
        }
        // 清理 seek，autoPlayPending 保留到 playback-restart 决定最终状态
        this.seekPendingSeconds = null;
      });

      window.electron.ipcRenderer.on("mpv-playback-restart", () => {
        this.playbackStarted = true;
        // 决定最终状态
        if (this.forcePaused || this.autoPlayPending === false) {
          this.handlers.onPlayStateChange?.(false);
          window.electron.ipcRenderer.send("mpv-pause");
          this.forcePaused = true;
        } else {
          this.handlers.onPlayStateChange?.(true);
          this.forcePaused = false;
        }
        this.handlers.onPlaybackRestart?.();
        // 清理 pending 标志
        this.autoPlayPending = null;
      });

      window.electron.ipcRenderer.on("mpv-ended", (_: any, reason: string) => {
        this.playbackStarted = false;
        this.handlers.onEnded?.(reason);
      });
    }
  }

  public setHandlers(handlers: MpvEventHandlers) {
    this.handlers = handlers;
  }

  /** 用户主动播放：解除强制暂停 */
  public clearForcePaused() {
    this.forcePaused = false;
  }

  /** 播放指定 URL */
  public async play(url: string, autoPlay: boolean) {
    this.autoPlayPending = autoPlay;
    const { name, artist } = getPlayerInfoObj() || {};
    const playTitle = `${name || ""} - ${artist || ""}`;
    const res = await window.electron.ipcRenderer.invoke("mpv-play", url, playTitle, autoPlay);
    if (!res?.success) {
      throw new Error(res?.error || "MPV 播放失败");
    }
  }

  /** 设置期望 Seek（秒），在 file-loaded 后执行 */
  public setPendingSeek(seconds: number | null) {
    this.seekPendingSeconds = seconds;
  }

  public pause() {
    window.electron.ipcRenderer.send("mpv-pause");
  }

  public resume() {
    window.electron.ipcRenderer.send("mpv-resume");
  }

  public stop() {
    window.electron.ipcRenderer.send("mpv-stop");
  }

  public seek(seconds: number) {
    window.electron.ipcRenderer.send("mpv-seek", seconds);
  }

  public setVolume(volume01: number) {
    window.electron.ipcRenderer.send("mpv-set-volume", volume01 * 100);
  }

  public setRate(rate: number) {
    window.electron.ipcRenderer.send("mpv-set-rate", rate);
  }
}

let instance: MpvManager | null = null;
export const useMpvManager = (): MpvManager => {
  if (!instance) instance = new MpvManager();
  return instance;
};
