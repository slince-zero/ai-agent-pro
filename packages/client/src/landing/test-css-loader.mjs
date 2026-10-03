/** DOM 测试跳过样式导入，CSS 由真实浏览器验证。 */
/** @type {import('node:module').LoadHook} */
export const load = async (url, context, nextLoad) => {
  if (url.endsWith('.css')) {
    return { format: 'module', source: '', shortCircuit: true }
  }
  return nextLoad(url, context)
}
