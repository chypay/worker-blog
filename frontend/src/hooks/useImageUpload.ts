/**
 * 文章编辑中的图片上传逻辑
 *
 * 功能：
 * - 封面上传
 * - 内容区粘贴图片 / 选择文件上传，并按光标位置插入 Markdown
 *
 * @author 博客系统
 */

import { useState } from 'react';
import type { RefObject } from 'react';
import { api } from '../utils/api';

interface UseImageUploadOptions {
  content: string;
  setContent: (value: string) => void;
  setCoverImage: (value: string) => void;
  setError: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

export function useImageUpload({
  content,
  setContent,
  setCoverImage,
  setError,
  textareaRef,
}: UseImageUploadOptions) {
  const [uploading, setUploading] = useState(false);

  // 把图片 Markdown 插入到光标处（没有光标就追加到末尾）
  const insertImageAtCursor = (imageUrl: string) => {
    const markdownImage = `![图片](${imageUrl})`;
    const textarea = textareaRef.current;

    if (!textarea) {
      setContent(`${content}\n${markdownImage}\n`);
      return;
    }

    const cursorPosition = textarea.selectionStart ?? content.length;
    const selectionEnd = textarea.selectionEnd ?? cursorPosition;
    const beforeCursor = content.substring(0, cursorPosition);
    const afterCursor = content.substring(selectionEnd);
    setContent(beforeCursor + markdownImage + afterCursor);

    setTimeout(() => {
      textarea.focus();
      const newPosition = cursorPosition + markdownImage.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  const uploadAndInsert = async (file: File, label: string) => {
    try {
      setUploading(true);
      const response = await api.uploadImage(file);
      if (response.success && response.data) {
        insertImageAtCursor(response.data.url);
      } else {
        setError(`${label}失败: ${response.message || '未知错误'}`);
      }
    } catch (error) {
      setError(`${label}失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setUploading(false);
    }
  };

  // 处理封面图片上传（上传后直接回填到封面字段）
  const handleCoverImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const response = await api.uploadImage(file);
      if (response.success && response.data) {
        setCoverImage(response.data.url);
      } else {
        setError(`封面图片上传失败: ${response.message || '未知错误'}`);
      }
    } catch (error) {
      setError('上传失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // 内容区选择文件上传并插入
  const handleContentImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadAndInsert(file, '图片上传');
    e.target.value = '';
  };

  // 处理内容区域粘贴图片
  const handleContentPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') === 0) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (file) {
          await uploadAndInsert(file, '图片粘贴');
        }
        return;
      }
    }
  };

  return { uploading, handleCoverImageUpload, handleContentImageUpload, handleContentPaste };
}
