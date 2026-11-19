import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import HomePage from './HomePage';

const mockNavigate = jest.fn();

jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...rest }) => <a href={to} {...rest}>{children}</a>,
}), { virtual: true });

jest.mock('../components/AppHeader', () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

jest.mock('../components/AppFooter', () => ({
  AppFooter: () => <div data-testid="app-footer" />,
}));

jest.mock('../components/ProductCard', () => ({
  ProductCard: () => <div data-testid="product-card" />,
}));

jest.mock('../components/Button', () => ({
  Button: ({ children, ...rest }) => <button {...rest}>{children}</button>,
}));

jest.mock('../components/Toast', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  }),
}));

jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

describe('HomePage Hero Banner Carousel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('fetches dynamic banners including .gif, handles click navigation & broken image fallback', async () => {
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/api/banners')) {
        return Promise.resolve({
          data: [
            {
              _id: 'b1',
              title: 'Flash Sale GIF',
              imageUrl: 'http://localhost:4001/uploads/promo-anim.gif',
              targetUrl: '/products',
              openInNewTab: false,
            },
            {
              _id: 'b2',
              title: 'External Promo',
              imageUrl: 'https://example.com/broken-img.jpg',
              targetUrl: 'https://haihand.vn/event',
              openInNewTab: true,
            },
          ],
        });
      }
      if (url.endsWith('/api/categories')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);

    render(<HomePage />);

    const gifImg = await screen.findByAltText('Flash Sale GIF');
    expect(gifImg).toHaveAttribute('src', 'http://localhost:4001/uploads/promo-anim.gif');

    // Click active internal banner -> SPA navigate('/products')
    fireEvent.click(gifImg.closest('[role="link"]'));
    expect(mockNavigate).toHaveBeenCalledWith('/products');

    // Switch to slide 2 via indicator -> verify broken image fallback + external tab open
    const slide2Btn = screen.getByLabelText('Go to slide 2');
    fireEvent.click(slide2Btn);
    expect(mockNavigate).toHaveBeenCalledTimes(1); // indicator click does NOT trigger banner link

    const extImg = screen.getByAltText('External Promo');
    fireEvent.error(extImg);
    expect(extImg.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);

    fireEvent.click(extImg.closest('[role="link"]'));
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith('https://haihand.vn/event', '_blank', 'noopener,noreferrer');
    });

    openSpy.mockRestore();
  });
});
