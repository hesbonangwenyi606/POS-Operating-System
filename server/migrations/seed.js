import { query, hashPassword } from '../db/database.js';

async function seed() {
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const adminHash = await hashPassword(adminPass);
  await query('INSERT INTO employees (username, password_hash, role, branch_id, active) VALUES ($1, $2, $3, $4, 1) ON CONFLICT (username) DO NOTHING', [adminUser, adminHash, 'owner', 1]);
  console.log('Admin user seeded.');
  const branches = [
    ['OD-KIT', 'Open Doors Kitengela', 'Chuna Mall, Ground Floor, Shop 10, Kitengela, Kenya', '+254700000001'],
    ['OD-ATHI', 'Open Doors Athi River', 'Athi River, Kenya', '+254700000002'],
    ['OD-KIS', 'Open Doors Kisaju', 'Kisaju, Kenya', '+254700000003'],
    ['OD-ISA', 'Open Doors Isinya', 'Isinya, Kenya', '+254700000004'],
  ];

  for (const b of branches) {
    await query(
      'INSERT INTO branches (code, name, address, phone) VALUES ($1, $2, $3, $4) ON CONFLICT (code) DO NOTHING',
      b
    );
  }
  console.log('Branches seeded.');

  const roles = [
    ['owner', JSON.stringify(['*'])],
    ['manager', JSON.stringify(['create_order','edit_order','cancel_order','apply_discount','refund_payment','manage_services','view_reports','export_reports','manage_users','manage_settings','close_shift'])],
    ['cashier', JSON.stringify(['create_order','edit_order','apply_discount','view_reports'])],
    ['laundry_staff', JSON.stringify(['update_workflow','view_orders'])],
    ['delivery_staff', JSON.stringify(['update_delivery','view_orders'])],
    ['viewer', JSON.stringify(['view_reports'])],
  ];

  for (const r of roles) {
    await query(
      'INSERT INTO roles (name, permissions) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
      r
    );
  }
  console.log('Roles seeded.');

  const settings = [
    ['business_name', 'Open Doors Laundromat'],
    ['business_address', 'Chuna Mall, Ground Floor, Shop 10, Kitengela, Kenya'],
    ['business_phone', '+254700000001'],
    ['branch_code', 'OD-KIT'],
    ['currency', 'KES'],
    ['locale', 'en-KE'],
    ['tax_rate', '0'],
    ['tax_mode', 'inclusive'],
    ['express_surcharge_percent', '30'],
    ['normal_turnaround_hours', '24'],
    ['express_turnaround_hours', '4'],
    ['receipt_format', 'thermal_80mm'],
    ['order_number_format', 'OD-{YYYY}-{SEQ}'],
    ['next_order_number', '1'],
    ['mpesa_callback_url', '/api/mpesa/callback'],
    ['mpesa_consumer_key', ''],
    ['mpesa_consumer_secret', ''],
    ['mpesa_passkey', ''],
    ['mpesa_environment', 'sandbox'],
    ['sms_provider', ''],
    ['whatsapp_provider', ''],
    ['notification_enabled', 'true'],
    ['auto_sync', 'true'],
    ['sync_interval_seconds', '30'],
    ['backup_enabled', 'true'],
    ['backup_interval_hours', '24'],
    ['dark_mode', 'system'],
    ['printer_type', 'browser'],
    ['hardware_cash_drawer', 'false'],
    ['hardware_barcode_scanner', 'false'],
    ['hardware_scale', 'false'],
    ['inventory_enabled', 'false'],
    ['loyalty_enabled', 'false'],
    ['delivery_enabled', 'true'],
    ['workflow_stages', 'Received|Sorting|Washing|Drying|Ironing|Folding|Quality Check|Ready|Collected'],
  ];

  for (const [k, v] of settings) {
    await query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, v]);
  }
  console.log('Settings seeded.');

  const services = [
    ['wash','Washing · full load','Full load','Wash full load',600,'item',1,30],
    ['dry','Drying · full load','Full load','Dry full load',600,'item',1,30],
    ['iron','Ironing · full load','Full load','Iron full load',700,'item',1,30],
    ['wdf','Wash, dry & fold','Full load','Wash, dry & fold',1200,'item',1,30],
    ['wdih','Wash, dry, iron & hang','Full load','Wash, dry, iron & hang',1700,'item',1,30],
    ['excess','Excess load · per kg','Full load','Excess per kg',140,'kg',1,30],
    ['duvet-cover','Duvet cover','Household','Duvet cover',300,'item',1,30],
    ['bedsheet','Bedsheet','Household','Bedsheet',200,'item',1,30],
    ['curtains','Curtains · per kg','Household','Curtains per kg',300,'kg',1,30],
    ['pillow','Pillow','Household','Pillow',200,'item',1,30],
    ['towel','Towel','Household','Towel',200,'item',1,30],
    ['sheers','Sheers · per kg','Household','Sheers per kg',200,'kg',1,30],
    ['duvet1','Duvet / blanket · 1kg','Duvets','Duvet 1kg',500,'item',1,30],
    ['duvet2','Duvet / blanket · 2kg','Duvets','Duvet 2kg',700,'item',1,30],
    ['duvet3','Duvet / blanket · 3kg','Duvets','Duvet 3kg',900,'item',1,30],
    ['duvet4','Duvet / blanket · 4kg','Duvets','Duvet 4kg',1000,'item',1,30],
    ['tshirt','T-shirt','Garments','T-shirt',200,'item',1,30],
    ['shirt','Shirt / blouse / skirt','Garments','Shirt/blouse/skirt',200,'item',1,30],
    ['trouser','Trouser / dress','Garments','Trouser/dress',200,'item',1,30],
    ['dress','African / pleated dress','Garments','African dress',300,'item',1,30],
    ['hoodie','Hoodie / sweater','Garments','Hoodie/sweater',300,'item',1,30],
    ['jacket','Jacket · normal','Garments','Jacket normal',300,'item',1,30],
    ['suit2','Suit · two piece','Garments','Suit two piece',700,'item',1,30],
    ['suit3','Suit · three piece','Garments','Suit three piece',800,'item',1,30],
    ['wedding','Wedding gown','Special','Wedding gown',1500,'item',1,30],
    ['combo1','Wash + Iron + Fold','Combo','Wash + Iron + Fold',1500,'item',1,30],
    ['combo2','Wash + Dry + Iron','Combo','Wash + Dry + Iron',1800,'item',1,30],
  ];

  for (const s of services) {
    await query(
      'INSERT INTO services (sku, name, category, description, price, unit, express_available, express_surcharge_percent) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (sku) DO NOTHING',
      s
    );
  }
  console.log('Services seeded.');
}

seed().catch(e => { console.error(e); process.exit(1); });