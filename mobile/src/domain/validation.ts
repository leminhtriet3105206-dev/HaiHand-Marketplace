export const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
export const validPhone = (value: string) => /^(?:\+84|0)(?:3|5|7|8|9)\d{8}$/.test(value.trim().replace(/[\s.-]/g, ''));
