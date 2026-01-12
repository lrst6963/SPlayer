import { LyricLine } from "@applemusic-like-lyrics/lyric";

/**
 * 计算歌词索引
 * @param currentTime 当前播放时间 (ms)
 * @param lyrics 原始歌词数组
 * @param offset 偏移量
 * @returns 歌词索引
 */
export const calculateLyricIndex = (
  currentTime: number,
  lyrics: LyricLine[],
  offset: number = 0,
): number => {
  // 边界检查
  if (!lyrics || !lyrics.length) return -1;
  // 预处理时间
  const playSeek = currentTime + offset + 300;
  const getStart = (v: LyricLine) => v.startTime || 0;

  // 过滤掉背景行，建立原索引映射
  const visible: { line: LyricLine; idx: number }[] = [];
  for (let i = 0; i < lyrics.length; i++) {
    const line = lyrics[i];
    if (line?.isBG) continue;
    visible.push({ line, idx: i });
  }
  if (visible.length === 0) return -1;

  // 直接返回最后一句（基于可见行）
  const lastVisible = visible[visible.length - 1].line;
  if (playSeek >= (lastVisible.endTime ?? Infinity)) {
    return visible[visible.length - 1].idx;
  }

  // 判断是否普通歌词：看第一条可见行是否没有 endTime
  const isLrc = !visible[0].line.endTime;
  if (isLrc) {
    const idxInVisible = visible.findIndex(({ line }) => getStart(line) >= playSeek);
    const selected = idxInVisible === -1 ? visible.length - 1 : idxInVisible - 1;
    if (selected < 0) return -1;
    return visible[selected].idx;
  }

  // 逐字歌词（基于可见行计算）
  if (playSeek < getStart(visible[0].line)) return -1;
  const activeCandidates: number[] = [];
  for (let i = 0; i < visible.length; i++) {
    const { line, idx } = visible[i];
    if (getStart(line) > playSeek) break;
    const end = line.endTime ?? Infinity;
    if (playSeek >= getStart(line) && playSeek < end) {
      activeCandidates.push(idx); // 返回原数组索引
    }
  }
  // 不在任何区间 -> 找最近的上一句
  if (activeCandidates.length === 0) {
    const nextVisibleIdx = visible.findIndex(({ line }) => getStart(line) > playSeek);
    if (nextVisibleIdx === -1) {
      return visible[visible.length - 1].idx;
    }
    if (nextVisibleIdx - 1 < 0) return -1;
    return visible[nextVisibleIdx - 1].idx;
  }
  // 多句激活处理（保留最后2-3句，取第一项保证向前偏移）
  if (activeCandidates.length === 1) return activeCandidates[0];
  const keepCount = activeCandidates.length >= 3 ? 3 : 2;
  const concurrent = activeCandidates.slice(-keepCount);
  return concurrent[0];
};
