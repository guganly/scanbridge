// utils/sn.js - SN 识别工具
// 自动检测扫码结果中的序列号（SN）、MAC地址、IMEI等设备标识

const SN_PATTERNS = [
  // 显式 SN 标签
  { name: 'SN', regex: /SN[：:=]\s*([A-Za-z0-9\-]{4,40})/i },
  { name: 'S/N', regex: /S\/N[：:=]\s*([A-Za-z0-9\-]{4,40})/i },
  { name: 'Serial', regex: /Serial[：:=]\s*([A-Za-z0-9\-]{4,40})/i },
  // MAC 地址
  { name: 'MAC', regex: /([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}/ },
  // 常见 SN 格式（大写字母2-4位 + 数字8位以上，如 LC123456789）
  { name: 'SN格式', regex: /\b[A-Z]{2,4}\d{8,}\b/ },
  // 混合字母数字长序列（常见 Dell/HP 序列号，如 CN0K6J9NLO30046A0HGV）
  { name: '混合SN', regex: /\b[A-Za-z0-9]{12,24}\b/ },
  // 纯数字长序列（可能是序列号）
  { name: '纯数字SN', regex: /\b\d{12,}\b/ },
];

// 用于排除常见非 SN 内容的模式
const EXCLUDE_PATTERNS = [
  /^http/i,       // URL
  /^www\./i,      // URL
  /\./,           // 包含句点，大概率不是 SN
  /[\/:?=&]/,     // URL 或路径字符
];

/**
 * 检测文本中是否包含 SN
 * @param {string} text - 扫码结果文本
 * @returns {object|null} - { type, value } 或 null
 */
function detectSN(text) {
  if (!text || typeof text !== 'string') return null;

  for (const pattern of SN_PATTERNS) {
    const match = text.match(pattern.regex);
    if (match) {
      const value = match[1] || match[0];
      // 排除明显不是 SN 的内容
      if (pattern.name === '混合SN' && EXCLUDE_PATTERNS.some((p) => p.test(value))) {
        continue;
      }
      return { type: pattern.name, value };
    }
  }
  return null;
}

/**
 * 检测是否包含设备型号信息
 * @param {string} text - 扫码结果文本
 * @returns {string|null} - 设备型号 或 null
 */
function detectDeviceModel(text) {
  if (!text || typeof text !== 'string') return null;

  // 常见设备型号模式：字母+连字符+数字（如 ThinkPad-X1, iPhone-14）
  const modelPatterns = [
    /(\b[A-Z][a-zA-Z]+[\-\s]?[A-Z]?\d+[A-Za-z]?\b)/,  // ThinkPad X1, iPhone14
    /型号[：:]\s*([^\s,，]{2,30})/,                     // 型号: xxx
    /Model[：:]\s*([^\s,]{2,30})/i,                     // Model: xxx
  ];

  for (const pattern of modelPatterns) {
    const match = text.match(pattern);
    if (match) return (match[1] || match[0]).trim();
  }
  return null;
}

module.exports = { detectSN, detectDeviceModel };
