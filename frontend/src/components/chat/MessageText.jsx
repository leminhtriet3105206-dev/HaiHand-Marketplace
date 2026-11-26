import React from 'react';

const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;

/**
 * Hiển thị nội dung tin nhắn dạng text thuần (React tự escape XSS, KHÔNG dùng dangerouslySetInnerHTML).
 * Tự động nhận dạng link http(s) an toàn và mở tab mới với rel="noopener noreferrer".
 */
export default function MessageText({ text, className = '' }) {
  if (!text) return null;
  const parts = String(text).split(URL_REGEX);

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {parts.map((part, idx) => {
        if (/^https?:\/\/[^\s<>"']+$/.test(part)) {
          return (
            <a
              key={idx}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold break-all hover:opacity-80"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </span>
  );
}
