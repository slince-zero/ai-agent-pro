import OpenAI from 'openai'

/**
 * 循环和意图解析用的是同一个模型。写成一个常量而不是各写一遍字面量：
 * 换模型时漏改一处，两边的行为就会悄悄分叉，评测结果也就说不清是哪个模型跑出来的。
 */
export const DEEPSEEK_MODEL = 'deepseek-v4-flash'

export function createDeepSeekClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: 'https://api.deepseek.com',
  })
}
