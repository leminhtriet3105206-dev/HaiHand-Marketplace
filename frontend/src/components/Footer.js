import React from 'react';

const Footer = () => {
  return (
    <footer style={{
      backgroundColor: '#333',
      color: 'white',
      padding: '30px 0',
      marginTop: 'auto', // ✅ QUAN TRỌNG
      textAlign: 'center'
    }}>
      <div className="container">
        <h5 style={{color: '#ffce3d'}}>HaiHand</h5>
        <p style={{fontSize: '14px', opacity: 0.8}}>Nền tảng mua bán đồ cũ uy tín.</p>
        <hr style={{borderColor: '#555', width: '50%', margin: '15px auto'}} />
        <p style={{fontSize: '12px', marginBottom: 0}}>&copy; 2026 HaiHand. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer;