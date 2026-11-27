import React, { useState, useRef, useEffect } from 'react';

const EMOJIS = ['😊', '👍', '❤️', '🙏', '📦', '🎉', '🔥', '✅', '💯', '🚚'];

export default function MessageInput({
  disabled = false,
  onSend,
  onTypingStart,
  onTypingStop,
  quickRepliesNode = null,
  onOpenProductPicker = null,
  inputRef: externalInputRef = null
}) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);

  const internalInputRef = useRef(null);
  const textareaRef = externalInputRef || internalInputRef;
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    const combined = [...files, ...selected].slice(0, 4);
    previews.forEach((url) => URL.revokeObjectURL(url));
    setFiles(combined);
    setPreviews(combined.map((f) => URL.createObjectURL(f)));
    e.target.value = '';
  };

  const removeFileAt = (idx) => {
    URL.revokeObjectURL(previews[idx]);
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (disabled) return;
    if (!text.trim() && files.length === 0) return;

    const ok = await onSend?.({ content: text, files });
    if (ok !== false) {
      setText('');
      previews.forEach((url) => URL.revokeObjectURL(url));
      setFiles([]);
      setPreviews([]);
      setShowEmoji(false);
      onTypingStop?.();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Cho phép component cha chèn text mẫu trả lời nhanh vào ô nhập
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.insertTemplate = (tpl) => {
        setText((prev) => (prev ? `${prev} ${tpl}` : tpl));
        textareaRef.current?.focus();
      };
    }
  }, [textareaRef]);

  return (
    <form onSubmit={handleSubmit} className="bg-white border-t border-slate-200 p-3 space-y-2 relative shrink-0">
      {/* Image Previews */}
      {previews.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {previews.map((url, idx) => (
            <div key={url} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 shrink-0">
              <img src={url} alt="Xem trước" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeFileAt(idx)}
                aria-label="Xóa ảnh"
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center hover:bg-black/80"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Emoji Popover */}
      {showEmoji && (
        <div className="absolute bottom-full left-3 mb-2 bg-white border border-slate-200 rounded-2xl shadow-lg p-2 flex items-center gap-1.5 z-20">
          {EMOJIS.map((em) => (
            <button
              key={em}
              type="button"
              onClick={() => {
                setText((prev) => prev + em);
                textareaRef.current?.focus();
              }}
              className="w-8 h-8 rounded-lg hover:bg-slate-100 text-base flex items-center justify-center"
            >
              {em}
            </button>
          ))}
        </div>
      )}

      {/* Toolbar + Textarea */}
      <div className="flex items-end gap-2">
        <div className="flex items-center gap-1 shrink-0 pb-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            type="button"
            disabled={disabled || files.length >= 4}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Gửi hình ảnh"
            title="Gửi hình ảnh (tối đa 4 ảnh)"
            className="p-2 rounded-xl text-slate-500 hover:text-orange-600 hover:bg-orange-50 disabled:opacity-40 transition-colors"
          >
            <i className="far fa-image text-base"></i>
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={() => setShowEmoji((v) => !v)}
            aria-label="Chọn biểu tượng cảm xúc"
            title="Biểu tượng cảm xúc"
            className="p-2 rounded-xl text-slate-500 hover:text-orange-600 hover:bg-orange-50 disabled:opacity-40 transition-colors"
          >
            <i className="far fa-smile text-base"></i>
          </button>

          {quickRepliesNode}

          {onOpenProductPicker && (
            <button
              type="button"
              disabled={disabled}
              onClick={onOpenProductPicker}
              aria-label="Gửi thẻ sản phẩm"
              title="Gửi thẻ sản phẩm của Shop"
              className="p-2 rounded-xl text-slate-500 hover:text-orange-600 hover:bg-orange-50 disabled:opacity-40 transition-colors"
            >
              <i className="fas fa-box-open text-base"></i>
            </button>
          )}
        </div>

        <textarea
          ref={textareaRef}
          rows={1}
          maxLength={2000}
          disabled={disabled}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            onTypingStart?.();
          }}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'Chọn hội thoại để nhắn tin...' : 'Nhập tin nhắn... (Enter gửi, Shift+Enter xuống dòng)'}
          aria-label="Nội dung tin nhắn"
          className="flex-1 resize-none max-h-28 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-orange-400 focus:bg-white transition-colors"
        />

        <button
          type="submit"
          disabled={disabled || (!text.trim() && files.length === 0)}
          aria-label="Gửi tin nhắn"
          className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold shadow-xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 h-9 flex items-center gap-1.5"
        >
          <i className="fas fa-paper-plane"></i>
          <span className="hidden sm:inline">Gửi</span>
        </button>
      </div>
    </form>
  );
}
