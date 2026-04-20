/**
 * 外部文件变更检测工具函数
 * 比较磁盘内容与编辑器内容，判断是否需要提示用户重载
 */

/**
 * 判断文件是否被外部修改
 * 比较磁盘上的最新内容与编辑器中的当前内容，
 * 当两者不同时返回 true，表示需要提示用户重载。
 *
 * @param diskContent - 磁盘上的文件内容
 * @param editorContent - 编辑器中的当前内容
 * @returns 内容不同时返回 true
 */
export function shouldPromptReload(diskContent: string, editorContent: string): boolean {
  return diskContent !== editorContent
}
