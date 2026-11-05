import React, { useState, useEffect } from 'react';
import axiosClient, { persistUser } from '../../api/axiosClient';
import { useToast } from '../../components/Toast';

const SellerSettings = () => {
    const toast = useToast();
    const [shop, setShop] = useState({
        shopName: '',
        phone: '',
        address: '',
        taxCode: '',
        description: '',
        avatar: '',
        banner: ''
    });
    const [avatarFile, setAvatarFile] = useState(null);
    const [bannerFile, setBannerFile] = useState(null);
    const [avatarPreview, setAvatarPreview] = useState('');
    const [bannerPreview, setBannerPreview] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

    useEffect(() => {
        const fetchShop = async () => {
            try {
                const { data } = await axiosClient.get('/api/seller/shop');
                const info = data.shopInfo || {};
                setShop({
                    shopName: info.shopName || data.user?.name || '',
                    phone: info.phone || data.user?.phone || '',
                    address: info.address || data.user?.address || '',
                    taxCode: info.taxCode || '',
                    description: info.description || '',
                    avatar: info.avatar || data.user?.avatar || '',
                    banner: info.banner || ''
                });
            } catch (error) {
                console.error('Lỗi tải thông tin Shop', error);
                toast.error('Lỗi tải thông tin Shop');
            } finally {
                setLoading(false);
            }
        };

        fetchShop();
    }, [toast]);

    const handleAvatarSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    const handleBannerSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setBannerFile(file);
            setBannerPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('shopName', shop.shopName);
            formData.append('phone', shop.phone);
            formData.append('address', shop.address);
            formData.append('taxCode', shop.taxCode);
            formData.append('description', shop.description);

            if (avatarFile) formData.append('avatar', avatarFile);
            if (bannerFile) formData.append('banner', bannerFile);

            const { data } = await axiosClient.put('/api/seller/shop', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (data.user) {
                persistUser(data.user);
            }

            toast.success(data.message || 'Đã lưu thông tin gian hàng thành công!');
        } catch (error) {
            toast.error(error.response?.data?.message || 'Lỗi khi cập nhật gian hàng!');
        } finally {
            setSaving(false);
        }
    };

    const getImageUrl = (img) => {
        if (!img) return '';
        if (img.startsWith('http')) return img;
        return `${API_URL}/${img.replace(/\\/g, '/')}`;
    };

    if (loading) {
        return (
            <div className="py-24 text-center">
                <div className="w-10 h-10 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-sm font-bold text-slate-500">Đang tải hồ sơ Shop...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto animate-fade-in pb-16">
            <div>
                <h1 className="text-2xl font-black text-slate-800">Hồ sơ & Thiết lập Gian hàng B2C</h1>
                <p className="text-sm text-slate-500 mt-1">Tùy biến hình ảnh thương hiệu, địa chỉ kho và thông tin liên lạc của Shop</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Banner & Avatar section */}
                <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs">
                    {/* Banner */}
                    <div className="relative h-44 sm:h-56 bg-gradient-to-r from-orange-400 to-amber-500">
                        {(bannerPreview || shop.banner) && (
                            <img
                                src={bannerPreview || getImageUrl(shop.banner)}
                                alt="Shop Banner"
                                className="w-full h-full object-cover"
                            />
                        )}
                        <label className="absolute bottom-4 right-4 px-3 py-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-md text-white rounded-xl text-xs font-bold cursor-pointer transition-colors flex items-center gap-2">
                            <i className="fas fa-camera"></i> Đổi ảnh bìa
                            <input type="file" accept="image/*" onChange={handleBannerSelect} className="hidden" />
                        </label>
                    </div>

                    {/* Avatar */}
                    <div className="p-6 pt-0 relative flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4 -mt-16 sm:-mt-20">
                        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                            <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border-4 border-white shadow-md overflow-hidden bg-white shrink-0 group">
                                <img
                                    src={avatarPreview || getImageUrl(shop.avatar) || "https://ui-avatars.com/api/?name=" + encodeURIComponent(shop.shopName || "S") + "&background=EA580C&color=fff"}
                                    alt="Shop Avatar"
                                    className="w-full h-full object-cover"
                                />
                                <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-white text-xs font-bold">
                                    <i className="fas fa-pen mr-1"></i> Đổi logo
                                    <input type="file" accept="image/*" onChange={handleAvatarSelect} className="hidden" />
                                </label>
                            </div>
                            <div className="sm:mb-2">
                                <h3 className="text-xl font-black text-slate-800">{shop.shopName || "Tên Shop của bạn"}</h3>
                                <p className="text-xs text-emerald-600 font-bold flex items-center gap-1 justify-center sm:justify-start mt-0.5">
                                    <i className="fas fa-badge-check"></i> Gian hàng B2C chính thức
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Shop Information Fields */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
                    <h3 className="text-base font-extrabold text-slate-800 border-b border-slate-100 pb-3 flex items-center gap-2">
                        <i className="fas fa-store text-orange-500"></i>
                        Thông tin kinh doanh
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                Tên gian hàng (Shop Name) <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                value={shop.shopName}
                                onChange={(e) => setShop({ ...shop, shopName: e.target.value })}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-orange-500 text-sm font-semibold"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                Hotline CSKH / Số điện thoại Shop <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                value={shop.phone}
                                onChange={(e) => setShop({ ...shop, phone: e.target.value })}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-orange-500 text-sm font-medium"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                Địa chỉ kho lấy hàng / Đổi trả <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                placeholder="Số nhà, đường, phường, quận, tỉnh/TP"
                                value={shop.address}
                                onChange={(e) => setShop({ ...shop, address: e.target.value })}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-orange-500 text-sm font-medium"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1">
                                Mã số thuế doanh nghiệp / Hộ kinh doanh
                            </label>
                            <input
                                type="text"
                                placeholder="VD: 0314892182"
                                value={shop.taxCode}
                                onChange={(e) => setShop({ ...shop, taxCode: e.target.value })}
                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-orange-500 text-sm font-mono"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                            Giới thiệu về gian hàng
                        </label>
                        <textarea
                            rows="4"
                            placeholder="Mô tả các mặt hàng chuyên doanh, cam kết chất lượng, chính sách hậu mãi..."
                            value={shop.description}
                            onChange={(e) => setShop({ ...shop, description: e.target.value })}
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-orange-500 text-sm font-medium"
                        ></textarea>
                    </div>
                </div>

                {/* Submit Button */}
                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-xl shadow-md shadow-orange-500/25 transition-all hover:scale-102 disabled:opacity-50"
                    >
                        {saving ? (
                            <span className="inline-flex items-center gap-2">
                                <i className="fas fa-spinner fa-spin"></i> Đang lưu...
                            </span>
                        ) : 'Lưu thông tin Shop'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default SellerSettings;
