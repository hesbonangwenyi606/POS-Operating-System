# Open Doors Laundromat POS

A responsive, browser-based point-of-sale system for Open Doors Laundromat. It handles service selection, checkout, payments, laundry workflow tracking, printable receipts, customer history, pricing, and sales reporting.

The application uses the service prices published in the Open Doors corporate brochure and formats all money in Kenyan shillings (KES).

## Features

- Searchable laundry service catalog grouped by category
- Shopping cart with quantity controls and automatic totals
- Customer name, phone number, care notes, and fulfilment capture
- Normal 24-hour and express 4-hour turnaround options
- Automatic 30% express-service surcharge
- Percentage discounts
- M-Pesa, cash, card, and pay-later payment methods
- Collection and pickup/delivery fulfilment options
- Automatic order numbers and completion deadlines
- Order statuses: Received, Cleaning, Ready, Collected, and Cancelled
- Outstanding-balance tracking
- Printable customer receipts
- Customer directory generated from order history
- Revenue, order, average-sale, and outstanding-payment reports
- Seven-day sales chart and popular-service ranking
- CSV order export
- Editable service names, categories, and prices
- Responsive layouts for desktop, tablet, and mobile
- Local persistence between browser sessions

## Requirements

- [Node.js](https://nodejs.org/) 20 or newer
- npm 10 or newer
- A modern browser such as Chrome, Edge, Firefox, or Safari

Check the installed versions with:

```bash
node --version
npm --version
```

## Installation

From the project directory:

```bash
cd /home/leopardfx/laondary
npm install
```

## Run the POS

Start the development server:

```bash
npm run dev
```

Open the address shown in the terminal. The default local address is:

```text
http://localhost:5173/
```

Because the development server listens on all network interfaces, another device on the same local network can use the displayed `Network` address. Ensure the host firewall permits the connection before exposing it.

Stop the server by pressing `Ctrl+C` in the terminal where it is running.

## Administrator login

The POS opens on an administrator sign-in screen. Use the initial credentials:

```text
Username: admin
Password: OpenDoors@2026
```

The login is valid for the current browser session. Closing the browser session or selecting the logout button requires the administrator to sign in again. Logging out clears an unfinished cart but does not delete saved orders or service prices.

This client-side login is intended for a single-device demonstration or controlled local environment. The credentials are part of the frontend source and are not suitable for a public production deployment. Connect the application to secure server-side authentication before exposing it to the internet.

## Production build

Create an optimized production build:

```bash
npm run build
```

The generated static site is placed in `dist/`.

Preview that production build locally:

```bash
npm run preview
```

The contents of `dist/` can be deployed to any static host, including Netlify, Cloudflare Pages, GitHub Pages, an Nginx server, or shared hosting that supports static files.

## Daily usage

### Create an order

1. Open **Point of sale**.
2. Search for a service or select a category.
3. Click a service card to add it to the current order.
4. Adjust quantities with the `+` and `−` controls.
5. Select **Continue to checkout**.
6. Enter the customer's name and phone number.
7. Choose normal or express service.
8. Add any discount, amount received, payment method, fulfilment method, and care notes.
9. Select **Create order & receipt**.
10. Print or close the generated receipt.

Normal service is due in 24 hours. Express service is due in 4 hours and adds 30% to the discounted order calculation.

### Update an order

1. Open **Orders**.
2. Search by order number, customer name, or phone number if necessary.
3. Select an order number or the menu button on its row.
4. Review its items, payment information, notes, and due time.
5. Choose the new status and select **Save status**.

The expected workflow is:

```text
Received → Cleaning → Ready → Collected
```

Use `Cancelled` for an order that will not be fulfilled.

### Print a receipt

Open an order from **Orders**, select **Print receipt**, and then use the browser print dialog. The print stylesheet hides the application interface and prints only the receipt.

### View customers

The **Customers** screen automatically groups orders by phone number. It displays the customer's order count, lifetime spend, and most recent visit. No separate customer-entry step is required.

### View and export reports

The **Reports** screen includes:

- Gross payments received
- Total non-cancelled orders
- Average order value
- Outstanding customer balances
- Payments received over the last seven days
- The five most frequently ordered services

Select **Export report** to download all orders as a CSV file. The same export is available from the **Orders** screen.

### Change services and prices

1. Open **Services & prices**.
2. Select **Edit** beside an existing service, or select **Add service**.
3. Enter the service name, category, and KES price.
4. Save the change.

Use **Reset defaults** to restore the complete price list originally loaded from the brochure. This replaces all locally edited services and removes locally added services.

## Data storage

This version is a single-device POS. Orders and service changes are stored in the browser's `localStorage` under these keys:

| Key | Contents |
| --- | --- |
| `od-orders` | Orders, customers, payments, notes, and statuses |
| `od-services` | The editable service catalog and prices |

Important consequences:

- Data remains available after refreshing or closing the browser.
- Data is specific to the browser profile and device being used.
- Clearing site data or browser storage removes saved POS information.
- Private/incognito sessions may discard data when the window closes.
- Different devices do not automatically share or synchronize orders.
- CSV exports should be downloaded regularly as an operational backup.

This local-storage design is suitable for a single till or demonstration deployment. A production setup involving multiple cashiers or devices should use an authenticated backend and database.

## Seed data

On first launch, the application shows three example orders so the order, customer, and report screens are immediately demonstrable. Once orders are saved, the browser uses its stored order data.

To return to a completely fresh browser state, open the browser developer console for this site and run:

```js
localStorage.removeItem('od-orders');
localStorage.removeItem('od-services');
location.reload();
```

This permanently removes locally stored POS data for the application.

## Project structure

```text
laondary/
├── index.html          # Application HTML entry point and font loading
├── package.json        # npm scripts and Vite dependency
├── package-lock.json   # Reproducible dependency versions
├── README.md           # Project and operations documentation
└── src/
    ├── main.js         # POS state, screens, checkout, reports, and receipts
    └── style.css       # Responsive UI and print styling
```

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the live-reloading development server |
| `npm run build` | Create an optimized build in `dist/` |
| `npm run preview` | Serve the production build locally for verification |

## Browser and currency behavior

- Currency values use the `en-KE` locale and `KES` currency.
- Dates and times follow the browser's local timezone.
- Order numbers use the `OD-####` format and increment from the highest saved order number.
- Tax is presented as included; the application does not add a separate tax amount.

## Troubleshooting
### `vite: not found`
Install the project dependencies:

```bash
npm install
```

Then run `npm run dev` again.

### Port 5173 is already in use

Vite normally chooses another available port and prints it in the terminal. To request a specific port:

```bash
npm run dev -- --port 4173
```

### Another device cannot open the POS
- Use the `Network` URL printed by Vite, not `localhost`.
- Confirm both devices are on the same network.
- Confirm the computer's firewall permits incoming traffic on the selected port.
- Keep the Vite terminal running.

### Saved orders disappeared
Confirm that the same browser profile and URL are being used. `localhost`, `127.0.0.1`, and a network IP are separate browser origins and therefore have separate local-storage records.

### The receipt prints with the application interface
Open the receipt modal before printing, then use its **Print receipt** button. Enable background graphics in the print dialog if the printer/browser supports them.

### Changes do not appear after deployment
Run a fresh build and deploy the newly generated `dist/` directory:

```bash
npm run build
```

Then perform a hard refresh in the browser to clear cached assets.

## Security and production notes
The current app has no login system, server, cloud database, or role permissions. Do not treat browser storage as a secure customer database. Before using the POS across multiple tills or over the public internet, add:

- User authentication and cashier roles
- A secured server-side database
- Automatic backups
- Server-side validation and audit logs
- Encrypted network access through HTTPS
- Controlled handling and retention of customer contact information

## Business details

**Open Doors Laundromat**  
Chuna Mall, Ground Floor, Shop 10  
Kitengela, Kenya

Service areas include Kisaju, Kitengela, Isinya, and Athi River.

> So Fresh, So Clean, So You.
