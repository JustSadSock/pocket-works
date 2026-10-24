// The writing/review workflow is client-only. PocketNet still receives one
// atomic 'submit' packet after the author has reviewed the hand-off.
export const splitWords=text=>String(text??'').trim().split(/\s+/u).filter(Boolean);
export const wordParts=text=>String(text??'').trim().match(/\s+|\S+/gu)||[];
export function handoffCount({roomVersion='v4',round=0,total=10,visibleTailWords=3,answer=''}) {
  if(['v4','v5','v6','v7','v8'].includes(roomVersion)&&round===total-1)return 0;
  return Math.min(Math.max(0,Number(visibleTailWords)||0),splitWords(answer).length);
}
export function handoffWords(answer,indices=[]) {
  const tokens=splitWords(answer);
  return indices.filter(i=>Number.isInteger(i)&&i>=0&&i<tokens.length).map(i=>tokens[i]);
}
export const hasMinimumDraft=answer=>splitWords(answer).length>=4;
