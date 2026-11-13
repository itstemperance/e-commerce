export interface ProductRetailMeta {
  brand: string;
  category:
    | 'Card đồ họa & CPU'
    | 'Laptop & Máy cầm tay'
    | 'Âm thanh & Microphone'
    | 'Màn hình & Đèn bàn'
    | 'Phụ kiện & Hub kết nối'
    | 'Bàn ghế & Đèn làm việc'
    | 'Lưu trữ & Mạng';
  rating: number;
  reviewCount: number;
  originalPrice?: number;
  badge?: string;
  highlights: string[];
  accentColor: string;
  iconType:
    | 'gpu'
    | 'laptop'
    | 'headphones'
    | 'keyboard'
    | 'monitor'
    | 'mouse'
    | 'ssd'
    | 'cpu'
    | 'motherboard'
    | 'ram'
    | 'dock'
    | 'mic'
    | 'controller'
    | 'chair'
    | 'desk'
    | 'lightbar'
    | 'nas'
    | 'router'
    | 'powerbank'
    | 'dac'
    | 'handheld';
}

const PRODUCT_META_BY_SLUG: Record<string, ProductRetailMeta> = {
  'nvidia-rtx-5090-founders-edition-flash': {
    brand: 'NVIDIA',
    category: 'Card đồ họa & CPU',
    rating: 4.9,
    reviewCount: 342,
    originalPrice: 61190000,
    badge: 'Flash Deal • Tiết kiệm 10.200.000 ₫',
    highlights: ['32GB Bộ nhớ GDDR7 siêu tốc', 'DLSS 4 Đa khung hình AI', 'Tản nhiệt buồng hơi 2 khe'],
    accentColor: 'from-emerald-900 via-zinc-900 to-black',
    iconType: 'gpu',
  },
  'macbook-pro-16-m4-max-flash': {
    brand: 'Apple',
    category: 'Laptop & Máy cầm tay',
    rating: 5.0,
    reviewCount: 518,
    originalPrice: 76490000,
    badge: 'Flash Deal • Tiết kiệm 12.500.000 ₫',
    highlights: ['M4 Max 16 nhân CPU / 40 nhân GPU', '128GB Bộ nhớ Unified', '2TB SSD NVMe • Space Black'],
    accentColor: 'from-slate-800 via-zinc-900 to-neutral-950',
    iconType: 'laptop',
  },
  'sony-wh-1000xm6-headphones': {
    brand: 'Sony',
    category: 'Âm thanh & Microphone',
    rating: 4.8,
    reviewCount: 1240,
    badge: 'Bán chạy nhất',
    highlights: ['Cảm biến kép chống ồn thích ứng', 'Thời lượng pin ấn tượng 40 giờ', 'Âm thanh độ phân giải cao LDAC'],
    accentColor: 'from-stone-700 via-stone-800 to-stone-950',
    iconType: 'headphones',
  },
  'keychron-q1-pro-keyboard': {
    brand: 'Keychron',
    category: 'Phụ kiện & Hub kết nối',
    rating: 4.8,
    reviewCount: 615,
    highlights: ['Vỏ nhôm nguyên khối chuẩn 6063', 'Tương thích phần mềm QMK / VIA', 'Switch cơ học Tactile Hot-Swap'],
    accentColor: 'from-slate-700 via-slate-800 to-slate-950',
    iconType: 'keyboard',
  },
  'lg-ultragear-32-4k-oled-240hz': {
    brand: 'LG UltraGear',
    category: 'Màn hình & Đèn bàn',
    rating: 4.9,
    reviewCount: 409,
    badge: 'Lựa chọn của BTV',
    highlights: ['32" 4K WOLED (Chế độ kép 240Hz / 480Hz)', 'Tốc độ phản hồi tức thì 0.03ms GtG', 'Tương thích NVIDIA G-SYNC & FreeSync Pro'],
    accentColor: 'from-indigo-900 via-slate-900 to-black',
    iconType: 'monitor',
  },
  'logitech-g-pro-x-superlight-2-dex': {
    brand: 'Logitech G',
    category: 'Phụ kiện & Hub kết nối',
    rating: 4.7,
    reviewCount: 890,
    highlights: ['Thiết kế siêu nhẹ chỉ 60g chuẩn Esports', 'Cảm biến HERO 2 độ nhạy 44K DPI', 'Kết nối không dây LIGHTSPEED 8000Hz'],
    accentColor: 'from-sky-900 via-slate-900 to-zinc-950',
    iconType: 'mouse',
  },
  'samsung-990-pro-4tb-nvme-ssd': {
    brand: 'Samsung',
    category: 'Lưu trữ & Mạng',
    rating: 4.9,
    reviewCount: 2150,
    highlights: ['Tốc độ đọc tuần tự lên tới 7.450 MB/s', 'Dung lượng 4TB PCIe 4.0 x4 NVMe M.2', 'Bộ tản nhiệt phủ niken cao cấp'],
    accentColor: 'from-neutral-800 via-zinc-900 to-black',
    iconType: 'ssd',
  },
  'amd-ryzen-9-9950x3d-processor': {
    brand: 'AMD',
    category: 'Card đồ họa & CPU',
    rating: 4.9,
    reviewCount: 478,
    badge: 'Mới ra mắt',
    highlights: ['16 nhân / 32 luồng xử lý cực mạnh', 'Bộ nhớ đệm 3D V-Cache Gen 2 (144MB)', 'Xung nhịp tăng tốc lên đến 5.7 GHz'],
    accentColor: 'from-orange-900 via-zinc-900 to-black',
    iconType: 'cpu',
  },
  'asus-rog-crosshair-x870e-hero': {
    brand: 'ASUS ROG',
    category: 'Card đồ họa & CPU',
    rating: 4.7,
    reviewCount: 194,
    highlights: ['Dàn cấp nguồn 18+2+2 pha điện', 'Hỗ trợ PCIe 5.0 & DDR5 NitroPath', 'Cổng kết nối kép USB4 & chuẩn Wi-Fi 7'],
    accentColor: 'from-rose-950 via-zinc-900 to-black',
    iconType: 'motherboard',
  },
  'corsair-dominator-titanium-64gb-ddr5': {
    brand: 'Corsair',
    category: 'Card đồ họa & CPU',
    rating: 4.8,
    reviewCount: 332,
    highlights: ['Bộ kit 64GB (2x32GB) DDR5-6600MHz', 'Thanh tản nhiệt hợp kim kẽm đúc', 'Tương thích Intel XMP 3.0 & AMD EXPO'],
    accentColor: 'from-slate-800 via-zinc-900 to-black',
    iconType: 'ram',
  },
  'caldigit-ts4-thunderbolt-4-dock': {
    brand: 'CalDigit',
    category: 'Phụ kiện & Hub kết nối',
    rating: 4.9,
    reviewCount: 980,
    badge: 'Đánh giá cao nhất',
    highlights: ['18 cổng kết nối ngoại vi toàn diện', 'Sạc máy chủ công suất lớn 98W', 'Cổng mạng LAN 2.5GbE & đầu đọc thẻ UHS-II'],
    accentColor: 'from-zinc-700 via-zinc-800 to-zinc-950',
    iconType: 'dock',
  },
  'shure-sm7db-dynamic-microphone': {
    brand: 'Shure',
    category: 'Âm thanh & Microphone',
    rating: 4.9,
    reviewCount: 740,
    highlights: ['Tích hợp sẵn Preamp chủ động (+18dB/+28dB)', 'Màng thu Cardioid định hướng phòng thu', 'Hỗ trợ cấp nguồn XLR Phantom'],
    accentColor: 'from-neutral-800 via-neutral-900 to-black',
    iconType: 'mic',
  },
  'elgato-stream-deck-plus': {
    brand: 'Elgato',
    category: 'Phụ kiện & Hub kết nối',
    rating: 4.8,
    reviewCount: 625,
    highlights: ['8 phím màn hình LCD tùy biến', 'Dải cảm ứng điều khiển linh hoạt', '4 núm xoay vô cực điều khiển xúc giác'],
    accentColor: 'from-blue-950 via-slate-900 to-black',
    iconType: 'controller',
  },
  'herman-miller-embody-chair': {
    brand: 'Herman Miller',
    category: 'Bàn ghế & Đèn làm việc',
    rating: 4.9,
    reviewCount: 512,
    highlights: ['Hệ thống nâng đỡ pixel mô phỏng cột sống', 'Cơ chế cân chỉnh tự nhiên Backfit', 'Bảo hành chính hãng 12 năm từ nhà sản xuất'],
    accentColor: 'from-teal-950 via-slate-900 to-black',
    iconType: 'chair',
  },
  'secretlab-magnus-pro-xl-desk': {
    brand: 'Secretlab',
    category: 'Bàn ghế & Đèn làm việc',
    rating: 4.9,
    reviewCount: 830,
    highlights: ['Khung bàn kim loại nâng hạ toàn phần', 'Cột cấp nguồn điện thông minh tích hợp', 'Máng giấu dây điện toàn bộ chiều dài'],
    accentColor: 'from-zinc-800 via-neutral-900 to-black',
    iconType: 'desk',
  },
  'benq-screenbar-halo-monitor-light': {
    brand: 'BenQ',
    category: 'Màn hình & Đèn bàn',
    rating: 4.8,
    reviewCount: 1120,
    highlights: ['Quang học bất đối xứng chống lóa màn hình', 'Bộ điều khiển xoay không dây tiện lợi', 'Đèn chiếu nền kết hợp giảm mỏi mắt'],
    accentColor: 'from-amber-950 via-stone-900 to-black',
    iconType: 'lightbar',
  },
  'synology-ds923-plus-4-bay-nas': {
    brand: 'Synology',
    category: 'Lưu trữ & Mạng',
    rating: 4.8,
    reviewCount: 445,
    highlights: ['Lưu trữ đám mây cá nhân 4 khay ổ cứng', '2 khe cắm bộ đệm NVMe M.2 siêu tốc', 'Bộ vi xử lý nhúng AMD Ryzen mạnh mẽ'],
    accentColor: 'from-slate-800 via-slate-900 to-black',
    iconType: 'nas',
  },
  'ubiquiti-unifi-dream-machine-pro-max': {
    brand: 'Ubiquiti',
    category: 'Lưu trữ & Mạng',
    rating: 4.9,
    reviewCount: 290,
    highlights: ['Cổng mạng quang 10G SFP+ & LAN 2.5GbE', 'Băng thông định tuyến bảo mật IPS 5 Gbps', '2 khay ổ đĩa lưu trữ camera giám sát NVR RAID'],
    accentColor: 'from-sky-950 via-slate-900 to-black',
    iconType: 'router',
  },
  'anker-prime-27650mah-250w-power-bank': {
    brand: 'Anker',
    category: 'Phụ kiện & Hub kết nối',
    rating: 4.8,
    reviewCount: 1560,
    highlights: ['Công suất sạc nhanh đa thiết bị 250W', 'Dung lượng 27.650mAh chuẩn an toàn hàng không', 'Màn hình hiển thị thông số điện tử OLED'],
    accentColor: 'from-neutral-700 via-zinc-900 to-black',
    iconType: 'powerbank',
  },
  'sennheiser-hd-800-s-headphones': {
    brand: 'Sennheiser',
    category: 'Âm thanh & Microphone',
    rating: 4.9,
    reviewCount: 380,
    highlights: ['Màng loa vòng bức xạ Ring Radiator 56mm', 'Thiết kế mở tái tạo không gian âm trường trung thực', 'Chế tác thủ công chính xác tại Đức'],
    accentColor: 'from-zinc-800 via-stone-900 to-black',
    iconType: 'headphones',
  },
  'rme-adi-2-dac-fs-converter': {
    brand: 'RME Audio',
    category: 'Âm thanh & Microphone',
    rating: 5.0,
    reviewCount: 215,
    highlights: ['Bộ giải mã DAC tham chiếu 768kHz / 32-Bit', 'Đồng hồ xung siêu chính xác SteadyClock FS', 'Amp khuếch đại tai nghe Extreme Power chuyên dụng'],
    accentColor: 'from-slate-900 via-zinc-900 to-black',
    iconType: 'dac',
  },
  'valve-steam-deck-oled-1tb': {
    brand: 'Valve',
    category: 'Laptop & Máy cầm tay',
    rating: 4.9,
    reviewCount: 1890,
    badge: 'Được yêu thích nhất',
    highlights: ['Màn hình 7.4" 90Hz HDR OLED kính nhám chống chói', 'Bộ nhớ trong 1TB NVMe + chuẩn Wi-Fi 6E', 'Dung lượng pin mở rộng 50Wh bền bỉ'],
    accentColor: 'from-orange-950 via-zinc-900 to-black',
    iconType: 'handheld',
  },
};

export function getProductRetailMeta(slug: string, isFlashSale = false): ProductRetailMeta {
  const found = PRODUCT_META_BY_SLUG[slug];
  if (found) return found;

  return {
    brand: 'Aura Studio',
    category: 'Phụ kiện & Hub kết nối',
    rating: 4.8,
    reviewCount: 128,
    badge: isFlashSale ? '⚡ Flash Deal Giới hạn' : undefined,
    highlights: ['Bảo hành 2 năm chính hãng', 'Giao hàng hỏa tốc miễn phí', 'Đổi trả dễ dàng 30 ngày'],
    accentColor: 'from-slate-800 via-slate-900 to-black',
    iconType: 'laptop',
  };
}

export const RETAIL_CATEGORIES = [
  'Tất cả phân loại',
  'Card đồ họa & CPU',
  'Laptop & Máy cầm tay',
  'Âm thanh & Microphone',
  'Màn hình & Đèn bàn',
  'Phụ kiện & Hub kết nối',
  'Bàn ghế & Đèn làm việc',
  'Lưu trữ & Mạng',
] as const;
