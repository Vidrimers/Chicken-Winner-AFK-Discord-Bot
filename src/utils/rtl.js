/**
 * Убрать RTL-символы (арабский, иврит и т.д.) из строки для корректного отображения
 */
export function stripRtl(str) {
  return str.replace(/[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g, '');
}
