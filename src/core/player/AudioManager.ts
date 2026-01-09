import { useSettingStore } from "@/stores";
import { AudioElementPlayer } from "../audio-player/AudioElementPlayer";
import {
  AUDIO_EVENTS,
  AudioEventType,
  BaseAudioPlayer,
  type AudioEventMap,
} from "../audio-player/BaseAudioPlayer";
import { FFmpegAudioPlayer } from "../audio-player/ffmpeg-engine/FFmpegAudioPlayer";

/**
 * 音频管理器
 *
 * 职责：作为 Facade 统一对外暴露接口，持有具体的播放器实现 (AudioElementPlayer 或 FFmpegPlayer)
 * 并负责事件的转发
 */
class AudioManager extends EventTarget {
  /** 当前活动的播放器实现 */
  private player: BaseAudioPlayer;
  /** 用于清理当前 player 的事件监听器 */
  private cleanupListeners: (() => void) | null = null;
  /** 当前引擎类型 */
  public readonly engineType: "ffmpeg" | "element";

  constructor(engineType: "ffmpeg" | "element") {
    super();

    if (engineType === "ffmpeg") {
      this.player = new FFmpegAudioPlayer();
    } else {
      this.player = new AudioElementPlayer();
    }
    this.engineType = engineType;
    this.bindPlayerEvents();
  }

  private bindPlayerEvents() {
    if (this.cleanupListeners) {
      this.cleanupListeners();
    }

    const events = Object.values(AUDIO_EVENTS);
    const handlers: Map<string, EventListener> = new Map();

    events.forEach((eventType) => {
      const handler = (e: Event) => {
        if (e instanceof CustomEvent) {
          this.dispatchEvent(new CustomEvent(eventType, { detail: e.detail }));
        } else {
          this.dispatchEvent(new Event(eventType));
        }
      };
      handlers.set(eventType, handler);
      this.player.addEventListener(eventType, handler);
    });

    this.cleanupListeners = () => {
      handlers.forEach((handler, eventType) => {
        this.player.removeEventListener(eventType as AudioEventType, handler);
      });
    };
  }

  /**
   * 初始化
   *
   * 通常在首次播放时自动调用，也可手动调用以预热 AudioContext
   */
  public init() {
    this.player.init();
  }

  /**
   * 加载并播放音频
   * @param url 音频地址
   * @param options 播放选项 (fadeIn: 是否渐入, fadeDuration: 渐入时长, autoPlay: 是否自动播放)
   */
  public async play(
    url?: string,
    options?: { fadeIn?: boolean; fadeDuration?: number; autoPlay?: boolean },
  ) {
    await this.player.play(url, options);
  }

  /**
   * 暂停音频
   * @param options 暂停选项 (fadeOut: 是否渐出, fadeDuration: 渐出时长)
   */
  public pause(options?: { fadeOut?: boolean; fadeDuration?: number }) {
    this.player.pause(options);
  }

  /**
   * 停止播放并将时间重置为 0
   */
  public stop() {
    this.player.stop();
  }

  /**
   * 切换播放/暂停
   */
  public togglePlayPause() {
    this.player.togglePlayPause();
  }

  /**
   * 跳转到指定时间
   * @param time 时间（秒）
   */
  public seek(time: number) {
    this.player.seek(time);
  }

  /**
   * 设置音量
   * @param value 音量值 (0.0 - 1.0)
   */
  public setVolume(value: number) {
    this.player.setVolume(value);
  }

  /**
   * 获取当前音量
   * @returns 当前音量值 (0.0 - 1.0)
   */
  public getVolume(): number {
    return this.player.getVolume();
  }

  /**
   * 设置播放速率
   * @param value 速率 (0.5 - 2.0)
   */
  public setRate(value: number) {
    this.player.setRate(value);
  }

  /**
   * 获取当前播放速率
   * @returns 当前速率
   */
  public getRate(): number {
    return this.player.getRate();
  }

  /**
   * 设置输出设备
   */
  public async setSinkId(deviceId: string) {
    await this.player.setSinkId(deviceId);
  }

  /**
   * 获取频谱数据 (用于可视化)
   * @returns Uint8Array 频谱数据
   */
  public getFrequencyData(): Uint8Array {
    return this.player.getFrequencyData();
  }

  /**
   * 获取低频音量 [0.0-1.0]
   * 用于驱动背景动画等视觉效果
   * @returns 低频音量值
   */
  public getLowFrequencyVolume(): number {
    return this.player.getLowFrequencyVolume();
  }

  /**
   * 设置均衡器增益
   * @param index 频段索引 (0-9)
   * @param value 增益值 (-40 to 40)
   */
  public setFilterGain(index: number, value: number) {
    this.player.setFilterGain(index, value);
  }

  /**
   * 获取当前均衡器设置
   * @returns 各频段增益值数组
   */
  public getFilterGains(): number[] {
    return this.player.getFilterGains();
  }

  /**
   * 获取音频总时长
   * @returns 总时长（秒）
   */
  public get duration() {
    return this.player.duration;
  }

  /**
   * 获取当前播放时间
   * @returns 当前播放时间（秒）
   */
  public get currentTime() {
    return this.player.currentTime;
  }

  /**
   * 获取是否暂停状态
   * @returns 是否暂停
   */
  public get paused() {
    return this.player.paused;
  }

  /**
   * 获取当前播放地址
   * @returns 当前播放地址
   */
  public get src() {
    return this.player.src;
  }

  /**
   * 获取音频错误码
   * @returns 错误码
   */
  public getErrorCode(): number {
    return this.player.getErrorCode();
  }

  public override addEventListener<K extends keyof AudioEventMap>(
    type: K,
    listener: (this: AudioManager, ev: AudioEventMap[K]) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void {
    super.addEventListener(type, listener as EventListenerOrEventListenerObject, options);
  }

  public override removeEventListener<K extends keyof AudioEventMap>(
    type: K,
    listener: (this: AudioManager, ev: AudioEventMap[K]) => unknown,
    options?: boolean | EventListenerOptions,
  ): void {
    super.removeEventListener(type, listener as EventListenerOrEventListenerObject, options);
  }
}

let instance: AudioManager | null = null;

/**
 * 获取 AudioManager 实例
 * @returns AudioManager
 */
export const useAudioManager = (): AudioManager => {
  if (!instance) {
    const settingStore = useSettingStore();
    instance = new AudioManager(settingStore.audioEngine);
  }
  return instance;
};
