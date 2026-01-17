/**
 * Notion API 相关类型定义
 */

import type {
  PageObjectResponse,
  DatabaseObjectResponse,
  BlockObjectResponse
} from '@notionhq/client/build/src/api-endpoints';

// 导出 Notion SDK 类型
export type NotionPage = PageObjectResponse;
export type NotionDatabase = DatabaseObjectResponse;
export type NotionBlock = BlockObjectResponse;

// Notion 页面属性类型
export interface NotionPageProperties {
  Title: { title: Array<{ plain_text: string }> };
  Status: { select: { name: string } | null };
  Slug: { rich_text: Array<{ plain_text: string }> };
  Description: { rich_text: Array<{ plain_text: string }> };
  Published: { date: { start: string } | null };
  Updated?: { date: { start: string } | null };
  Tags?: { multi_select: Array<{ name: string }> };
  Cover?: { files: Array<{ file?: { url: string }; external?: { url: string } }> };
}

// 从 Notion 页面提取的元数据
export interface NotionPostMetadata {
  id: string;
  title: string;
  slug: string;
  description: string;
  publishedAt: string;
  updatedAt: string | null;
  tags: string[];
  coverUrl: string;
}

// Notion 转换后的完整文章
export interface NotionPost extends NotionPostMetadata {
  content: string;
  markdown: string;
}

// API 层类型
export interface BlockValue {
  id: string;
  type: string;
  format?: any;
  properties?: any;
  content?: string[];
  [key: string]: any;
}

export interface PageData {
  block?: Record<string, { value: BlockValue }>;
  collection?: Record<string, { value: any }>;
  collection_view?: Record<string, { value: any }>;
  signed_urls?: Record<string, string>;  // blockId -> 永久签名 URL
}

export interface DatabaseMeta {
  title: string;
  description: string;
  coverUrl: string;
  icon: string;
}
