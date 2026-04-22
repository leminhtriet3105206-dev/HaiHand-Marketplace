import React from 'react';

const OrderDetailModal = ({ order, onClose }) => {
    if (!order) return null;

    return (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                
                <div className="bg-slate-50 p-6 border-b flex justify-between items-center">
                    <div>
                        <h4 className="font-black text-slate-800 mb-0">Chi tiết đơn hàng</h4>
                        <p className="text-xs text-slate-500 mb-0">Mã ĐH: #{order._id.toString().slice(-6).toUpperCase()}</p>
                    </div>
                    <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600 transition">✕</button>
                </div>

                <div className="p-6 max-h-[70vh] overflow-y-auto">
                    
                    <div className="space-y-4 mb-8">
                        <p className="font-bold text-sm uppercase tracking-wider text-slate-400">Sản phẩm</p>
                        {order.items.map((item, idx) => (
                            <div key={idx} className="flex gap-4 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                <div className="w-20 h-20 rounded-xl overflow-hidden bg-white shadow-sm flex-shrink-0">
                                    <img src={item.image || "https://via.placeholder.com/80"} alt={item.title} className="w-full h-full object-cover" />
                                </div>
                                <div className="flex-1">
                                    <h6 className="font-bold text-slate-800 mb-1 leading-snug">{item.title}</h6>
                                    <p className="text-primary font-black mb-0">{item.price?.toLocaleString('vi-VN')} đ</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t">
                        <div>
                            <p className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-3">Người nhận</p>
                            <p className="font-bold text-slate-800 mb-1">{order.buyer?.name || 'Người dùng HaiHand'}</p>
                            <p className="text-sm text-slate-500">📞 {order.phone}</p>
                        </div>
                        <div>
                            <p className="font-bold text-sm uppercase tracking-wider text-slate-400 mb-3">Địa chỉ nhận hàng</p>
                            <p className="text-sm text-slate-600 leading-relaxed">{order.address}</p>
                        </div>
                    </div>
                </div>

                
                <div className="bg-slate-50 p-6 border-t flex justify-between items-center">
                    <span className="font-bold text-slate-500 uppercase text-xs">Tổng thanh toán</span>
                    <span className="text-2xl font-black text-red-500">{order.totalPrice?.toLocaleString('vi-VN')} đ</span>
                </div>
            </div>
        </div>
    );
};

export default OrderDetailModal;