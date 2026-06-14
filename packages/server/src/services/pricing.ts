/**
 * 模型定价表 (USD / 1M tokens)
 * 数据来源：各模型官方定价页面
 */
const MODEL_PRICING: Record<
  string,
  { inputPrice: number; outputPrice: number }
> = {
  "deepseek-v4-pro": { inputPrice: 0.27, outputPrice: 1.1 },
  "deepseek-chat": { inputPrice: 0.14, outputPrice: 0.28 },
  "deepseek-reasoner": { inputPrice: 0.55, outputPrice: 2.19 },
};

/**
 * 根据模型名和 token 数计算费用
 * @returns 费用 (USD)，如果模型不在定价表中则返回 0
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputPrice;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPrice;

  return Math.round((inputCost + outputCost) * 1e8) / 1e8;
}
