// 프로필 / 사용자 아이콘 픽커 등에서 공통으로 쓰는 기본 이모지 세트.
// 다른 페이지(공유 사용자 라벨, 캘린더 사용자 칩 등)에서도 재사용.
export const PRESET_EMOJIS = [
  "🙂", "💕", "🌸", "⭐", "🐱", "🍀", "☕", "🌙",
  "🐶", "🦊", "🐼", "🐰", "🐻", "🦁", "🐯", "🐸",
  "🌈", "🔥", "✨", "💎", "🎵", "🎨", "🚀", "⚡",
] as const;

export type PresetEmoji = (typeof PRESET_EMOJIS)[number];
