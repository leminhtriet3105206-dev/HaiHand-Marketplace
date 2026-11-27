export type User = {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  avatar?: string;
  bio?: string;
  role?: string;
  token?: string;
  following?: string[];
};

export type Product = {
  _id: string;
  title?: string;
  name?: string;
  price: number;
  originalPrice?: number;
  category: string;
  location?: string;
  condition?: string;
  description?: string;
  images?: string[];
  image?: string;
  author?: User | string;
  sellerId?: User | string;
  stockQuantity?: number;
  createdAt?: string;
};

export type CartItem = {
  product: Product;
  quantity: number;
};
