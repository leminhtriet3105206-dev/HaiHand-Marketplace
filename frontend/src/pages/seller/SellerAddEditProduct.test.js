import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SellerAddEditProduct from './SellerAddEditProduct';
import axiosClient from '../../api/axiosClient';

const mockNavigate = jest.fn();
let mockParams = {};

jest.mock('../../api/axiosClient', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
  Link: ({ children, to, ...rest }) => <a href={to} {...rest}>{children}</a>,
}), { virtual: true });

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
};

jest.mock('../../components/Toast', () => ({
  useToast: () => mockToast,
}));

describe('SellerAddEditProduct - Dynamic Categories Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-preview');
  });

  test('fetches dynamic categories from GET /api/categories on mount and submits category _id', async () => {
    axiosClient.get.mockResolvedValueOnce({
      data: [
        { _id: 'cat_pet_1', name: 'Thú cưng & Đồ dùng' },
        { _id: 'cat_tech_2', name: 'Điện tử & Công nghệ' },
      ],
    });
    axiosClient.post.mockResolvedValueOnce({ data: { _id: 'prod_new' } });

    const { container } = render(<SellerAddEditProduct />);

    await waitFor(() => {
      expect(axiosClient.get).toHaveBeenCalledWith('/api/categories');
    });

    const optPet = await screen.findByRole('option', { name: 'Thú cưng & Đồ dùng' });
    const optTech = screen.getByRole('option', { name: 'Điện tử & Công nghệ' });

    expect(optPet).toHaveAttribute('value', 'cat_pet_1');
    expect(optTech).toHaveAttribute('value', 'cat_tech_2');
    expect(screen.queryByRole('option', { name: 'Mẹ & Bé' })).not.toBeInTheDocument();

    // Fill required fields and pick second category by _id
    const nameInput = screen.getByPlaceholderText(/Laptop Dell XPS/i);
    const priceInput = screen.getByPlaceholderText('VD: 550000');
    const selectEl = optPet.closest('select');
    const fileInput = container.querySelector('input[type="file"]');

    fireEvent.change(nameInput, { target: { value: 'MacBook Pro M2' } });
    fireEvent.change(priceInput, { target: { value: '25000000' } });
    fireEvent.change(selectEl, { target: { value: 'cat_tech_2' } });
    fireEvent.change(fileInput, {
      target: { files: [new File(['img'], 'macbook.png', { type: 'image/png' })] },
    });

    fireEvent.click(screen.getByRole('button', { name: /Đăng bán sản phẩm/i }));

    await waitFor(() => {
      expect(axiosClient.post).toHaveBeenCalledWith(
        '/api/seller/products',
        expect.any(FormData),
        expect.objectContaining({ headers: { 'Content-Type': 'multipart/form-data' } })
      );
    });

    const sentFormData = axiosClient.post.mock.calls[0][1];
    expect(sentFormData.get('category')).toBe('cat_tech_2');
  });

  test('handles GET /api/categories failure cleanly without crashing', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    axiosClient.get.mockRejectedValueOnce(new Error('Network Error'));

    render(<SellerAddEditProduct />);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        'Lỗi tải danh mục ngành hàng:',
        expect.any(Error)
      );
    });

    expect(screen.getByRole('option', { name: '-- Chọn danh mục ngành hàng --' })).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  test('maps legacy category name to _id in edit mode once categories resolve', async () => {
    mockParams = { id: 'prod_123' };
    axiosClient.get.mockImplementation((url) => {
      if (url === '/api/categories') {
        return Promise.resolve({
          data: [
            { _id: 'cat_id_tech', name: 'Điện tử & Công nghệ' },
          ],
        });
      }
      if (url === '/api/posts/prod_123') {
        return Promise.resolve({
          data: {
            _id: 'prod_123',
            name: 'iPhone 14',
            category: 'Điện tử & Công nghệ',
            price: 15000000,
            stockQuantity: 3,
            images: ['https://example.com/iphone.jpg'],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    render(<SellerAddEditProduct />);

    const option = await screen.findByRole('option', { name: 'Điện tử & Công nghệ' });
    const selectEl = option.closest('select');

    await waitFor(() => {
      expect(selectEl.value).toBe('cat_id_tech');
    });
  });
});

