/**
 * 数据服务入口
 * 使用 Notion API 作为唯一数据源
 */

// 检查 Notion 配置
const hasNotionConfig = !!(
  (import.meta.env?.NOTION_TOKEN || process.env?.NOTION_TOKEN) &&
  (import.meta.env?.NOTION_DATABASE_ID || process.env?.NOTION_DATABASE_ID)
);

if (!hasNotionConfig) {
  throw new Error(
    '❌ Notion configuration missing!\n' +
    '💡 Please set NOTION_TOKEN and NOTION_DATABASE_ID in your .env file.\n' +
    '📖 See README.md for setup instructions.'
  );
}

// 导出 Notion 数据服务
export { notionService as dataService, notionService as default } from './notion-service';
