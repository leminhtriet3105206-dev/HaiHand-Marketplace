import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CheckoutPage from './CheckoutPage';
import axiosClient from '../../api/axiosClient';

const mockNavigate = jest.fn();

jest.mock('../../api/axiosClient', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  useLocation: () => ({
    state: {
      items: [
        {
          postId: 'post1',
          quantity: 1,
          price: 150000,
          title: 'Áo khoác Vintage',
          seller: { _id: 'seller1', name: 'Shop Vintage' },
        },
      ],
    },
  }),
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...rest }) => <a href={to} {...rest}>{children}</a>,
}), { virtual: true });

jest.mock('../../components/AppHeader', () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

jest.mock('../../components/AppFooter', () => ({
  AppFooter: () => <div data-testid="app-footer" />,
}));

jest.mock('../../components/Toast', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  }),
}));

describe('CheckoutPage Address Form Modal Layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.setItem('user', JSON.stringify({ _id: 'user1', name: 'Buyer One' }));
    axiosClient.get.mockImplementation((url) => {
      if (url === '/api/addresses') return Promise.resolve({ data: { addresses: [] } });
      if (url === '/api/haipay/wallet') return Promise.resolve({ data: { balance: 0 } });
      if (url === '/api/shipping/provinces') {
        return Promise.resolve({ data: [{ ProvinceID: 202, ProvinceName: 'Hồ Chí Minh' }] });
      }
      if (url.startsWith('/api/shipping/districts')) {
        return Promise.resolve({ data: [{ DistrictID: 1442, DistrictName: 'Quận 1' }] });
      }
      if (url.startsWith('/api/shipping/wards')) {
        return Promise.resolve({ data: [{ WardCode: '20101', WardName: 'Phường Bến Nghé' }] });
      }
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  test('renders compact flex-col form layout, grouped location dropdowns, and right-aligned action buttons', async () => {
    render(<CheckoutPage />);

    const addBtn = await screen.findByText('+ Thêm địa chỉ nhận hàng');
    fireEvent.click(addBtn);

    const saveBtn = await screen.findByText('Lưu địa chỉ');
    const backBtn = screen.getByText('Quay lại');
    const formEl = saveBtn.closest('form');
    const fieldsWrapper = formEl.firstElementChild;

    expect(formEl).toHaveClass('h-auto');
    expect(fieldsWrapper).toHaveClass('flex', 'flex-col', 'gap-4');
    expect(saveBtn.parentElement).toHaveClass('flex', 'justify-end', 'gap-3', 'mt-6');
    expect(backBtn).toBeInTheDocument();

    // Verify Province / District / Ward cascading logic remains intact
    const selects = formEl.querySelectorAll('select');
    expect(selects.length).toBe(3);

    await waitFor(() => {
      expect(screen.getByText('Hồ Chí Minh')).toBeInTheDocument();
    });

    fireEvent.change(selects[0], { target: { value: '202' } });
    expect(await screen.findByText('Quận 1')).toBeInTheDocument();

    fireEvent.change(selects[1], { target: { value: '1442' } });
    expect(await screen.findByText('Phường Bến Nghé')).toBeInTheDocument();
  });

  test('fetches provinces on mount, normalizes { id, name } / { code, name } payloads without React key warnings, and resets cascading selects', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    axiosClient.get.mockImplementation((url) => {
      if (url === '/api/addresses') return Promise.resolve({ data: { addresses: [] } });
      if (url === '/api/haipay/wallet') return Promise.resolve({ data: { balance: 0 } });
      if (url === '/api/shipping/provinces') {
        return Promise.resolve({
          data: [
            { id: 202, name: 'Hồ Chí Minh' },
            { id: 201, name: 'Hà Nội' },
          ],
        });
      }
      if (url.includes('provinceId=202')) {
        return Promise.resolve({ data: [{ id: 1442, name: 'Quận 1' }] });
      }
      if (url.includes('provinceId=201')) {
        return Promise.resolve({ data: [{ id: 1489, name: 'Quận Hoàn Kiếm' }] });
      }
      if (url.includes('districtId=1442')) {
        return Promise.resolve({ data: [{ code: '20101', name: 'Phường Bến Nghé' }] });
      }
      return Promise.resolve({ data: {} });
    });

    render(<CheckoutPage />);

    // Verify fetch occurred on mount before opening the address modal
    await waitFor(() => {
      expect(axiosClient.get).toHaveBeenCalledWith('/api/shipping/provinces', undefined);
    });

    const addBtn = await screen.findByText('+ Thêm địa chỉ nhận hàng');
    fireEvent.click(addBtn);

    const formEl = (await screen.findByText('Lưu địa chỉ')).closest('form');
    const selects = formEl.querySelectorAll('select');

    expect(await screen.findByText('Hồ Chí Minh')).toBeInTheDocument();
    expect(screen.getByText('Hà Nội')).toBeInTheDocument();

    // Select Hồ Chí Minh -> Quận 1 -> Phường Bến Nghé
    fireEvent.change(selects[0], { target: { value: '202' } });
    expect(await screen.findByText('Quận 1')).toBeInTheDocument();

    fireEvent.change(selects[1], { target: { value: '1442' } });
    expect(await screen.findByText('Phường Bến Nghé')).toBeInTheDocument();
    fireEvent.change(selects[2], { target: { value: '20101' } });
    expect(selects[2].value).toBe('20101');

    // Change Province to Hà Nội -> clears District & Ward state and fetches new districts
    fireEvent.change(selects[0], { target: { value: '201' } });
    expect(selects[1].value).toBe('');
    expect(selects[2].value).toBe('');
    expect(await screen.findByText('Quận Hoàn Kiếm')).toBeInTheDocument();

    const keyWarnings = errorSpy.mock.calls.filter((args) =>
      String(args[0] || '').includes('unique "key" prop')
    );
    expect(keyWarnings.length).toBe(0);
    errorSpy.mockRestore();
  });
});

