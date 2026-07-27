/*
  The twenty invoices.

  Varied on the things that matter to an extraction model — supplier, layout
  wording, currency, date format, magnitude — rather than varied for its own
  sake. Three of them are deliberate awkward cases, marked below.
*/

export const INVOICES = [
  { supplier: "Ashcroft Joinery Ltd", address: "12 Wharf Road, Leeds LS1 4AP", taxId: "GB417820394", invoiceNumber: "AJ-4471", issueDate: "14 Mar 2025", dueDate: "13 Apr 2025", currency: "GBP", subtotal: "2,480.00", vat: "496.00", total: "2,976.00", lineItem: "Bespoke shelving, phase two" },
  { supplier: "Meridian Print Works", address: "8 Calder Street, Manchester M1 2WB", taxId: "GB556201447", invoiceNumber: "MPW-3310", issueDate: "04 Mar 2025", dueDate: "03 Apr 2025", currency: "GBP", subtotal: "980.00", vat: "196.00", total: "1,176.00", lineItem: "Catalogue print run, 2000 copies" },
  { supplier: "Northwind Trading Co", address: "441 Harbour Way, Bristol BS1 6QN", taxId: "GB771203998", invoiceNumber: "NW-5521", issueDate: "03 Feb 2025", dueDate: "05 Mar 2025", currency: "USD", subtotal: "677.00", vat: "135.40", total: "812.40", lineItem: "Freight forwarding, February" },
  { supplier: "Calder & Voss Ltd", address: "3 Exchange Square, Glasgow G1 3AN", taxId: "GB884120665", invoiceNumber: "CV-7742", issueDate: "19 May 2025", dueDate: "18 Jun 2025", currency: "GBP", subtotal: "3,400.00", vat: "680.00", total: "4,080.00", lineItem: "Structural survey and report" },
  { supplier: "Harbour Logistics Ltd", address: "77 Dock Approach, Liverpool L3 1DL", taxId: "GB662014883", invoiceNumber: "HL-9931", issueDate: "11 Jan 2025", dueDate: "10 Feb 2025", currency: "GBP", subtotal: "2,150.00", vat: "430.00", total: "2,580.00", lineItem: "Palletised distribution, Q1" },
  { supplier: "Selwyn Instruments", address: "5 Prospect Park, Cambridge CB4 0GA", taxId: "GB330891245", invoiceNumber: "SI-2088", issueDate: "22 Apr 2025", dueDate: "22 May 2025", currency: "EUR", subtotal: "1,845.50", vat: "369.10", total: "2,214.60", lineItem: "Calibration service, annual" },
  { supplier: "Pemberton Textiles", address: "19 Mill Lane, Huddersfield HD1 2QT", taxId: "GB201778340", invoiceNumber: "PT-6604", issueDate: "07 Feb 2025", dueDate: "09 Mar 2025", currency: "GBP", subtotal: "745.20", vat: "149.04", total: "894.24", lineItem: "Upholstery fabric, 60m" },
  { supplier: "Ardent Software Ltd", address: "2 Tower Gate, London EC3N 4AB", taxId: "GB998112057", invoiceNumber: "AS-1194", issueDate: "28 Jun 2025", dueDate: "28 Jul 2025", currency: "GBP", subtotal: "12,000.00", vat: "2,400.00", total: "14,400.00", lineItem: "Platform licence, annual renewal" },
  { supplier: "Greenfell Catering", address: "14 Market Row, Norwich NR2 1LZ", taxId: "GB445902118", invoiceNumber: "GC-0455", issueDate: "16 Sep 2025", dueDate: "16 Oct 2025", currency: "GBP", subtotal: "612.75", vat: "122.55", total: "735.30", lineItem: "Event catering, 90 covers" },
  { supplier: "Baltic Steel Import", address: "6 Quay Terrace, Hull HU1 1UU", taxId: "GB119437620", invoiceNumber: "BSI-8812", issueDate: "02 Dec 2024", dueDate: "01 Jan 2025", currency: "EUR", subtotal: "9,340.00", vat: "1,868.00", total: "11,208.00", lineItem: "Cold rolled coil, 12 tonnes" },
  { supplier: "Thornbury Scaffolding", address: "31 Priory Way, Bath BA2 3QQ", taxId: "GB774112908", invoiceNumber: "TS-3021", issueDate: "25 Jul 2025", dueDate: "24 Aug 2025", currency: "GBP", subtotal: "4,200.00", vat: "840.00", total: "5,040.00", lineItem: "Scaffold hire, eight weeks" },
  { supplier: "Kelmscott Bindery", address: "9 Paper Street, Oxford OX1 2JD", taxId: "GB283910446", invoiceNumber: "KB-1177", issueDate: "13 Oct 2025", dueDate: "12 Nov 2025", currency: "GBP", subtotal: "1,320.00", vat: "264.00", total: "1,584.00", lineItem: "Case binding, limited edition" },
  { supplier: "Orwell Electrical", address: "48 Fen Road, Ipswich IP1 3TG", taxId: "GB607223915", invoiceNumber: "OE-4409", issueDate: "05 Aug 2025", dueDate: "04 Sep 2025", currency: "GBP", subtotal: "2,875.00", vat: "575.00", total: "3,450.00", lineItem: "Distribution board replacement" },
  { supplier: "Marchmont Consulting", address: "22 Rutland Square, Edinburgh EH1 2BB", taxId: "GB512008774", invoiceNumber: "MC-7730", issueDate: "30 Nov 2025", dueDate: "30 Dec 2025", currency: "GBP", subtotal: "8,500.00", vat: "1,700.00", total: "10,200.00", lineItem: "Operating model review" },

  /*
    Hard to read. Not faintly printed — ambiguous. Everything the eight fields
    need is on the page, but nothing announces itself: two unlabelled dates, two
    competing totals, a reference code that may or may not be the invoice number.

    The first attempt made these pale grey and small, which turned out to change
    nothing: a PDF carries an exact text layer however faint the ink, so the model
    read them at the same 0.99 confidence as everything else and not one field
    reached needs_review. Faintness makes a page hard for a person. Ambiguity is
    what makes it hard for a model.
  */
  { supplier: "Faded Carbon Copy Ltd", address: "3 Old Foundry Yard, Sheffield S3 8LN", taxId: "GB330014782", invoiceNumber: "FCC-2210", issueDate: "18 Feb 2025", dueDate: "20 Mar 2025", currency: "GBP", subtotal: "1,090.00", vat: "218.00", total: "1,308.00", lineItem: "Reclaimed timber, mixed lot", faint: true, ambiguous: true },
  { supplier: "Thermal Roll Supplies", address: "60 Tanner Street, Nottingham NG1 1AA", taxId: "GB889003641", invoiceNumber: "TRS-0098", issueDate: "09/06/25", dueDate: "09/07/25", currency: "GBP", subtotal: "430.60", vat: "86.12", total: "516.72", lineItem: "Till roll, 200 units", ambiguous: true },

  /*
    Missing a field. No VAT number is printed anywhere on this page, which is the
    case specs/extraction.md wrote the prompt for: a null value with HIGH
    confidence means the model is sure the field is absent, and that is a
    different and more useful answer than a null it could not read.
  */
  { supplier: "Rowan Sole Trader", address: "5 Bramble Cottages, Hereford HR1 2PJ", taxId: "", invoiceNumber: "RST-0012", issueDate: "21 Mar 2025", dueDate: "20 Apr 2025", currency: "GBP", subtotal: "380.00", vat: "0.00", total: "380.00", lineItem: "Garden maintenance, March", omit: ["supplier_tax_id"] },

  { supplier: "Lyndhurst Plant Hire", address: "88 Quarry Lane, Derby DE1 3TT", taxId: "GB744120385", invoiceNumber: "LPH-5540", issueDate: "12 May 2025", dueDate: "11 Jun 2025", currency: "GBP", subtotal: "1,760.00", vat: "352.00", total: "2,112.00", lineItem: "Excavator hire, three weeks" },
  { supplier: "Castleford Packaging", address: "7 Aire Valley Road, Wakefield WF10 5QN", taxId: "GB618720043", invoiceNumber: "CP-2286", issueDate: "27 Aug 2025", dueDate: "26 Sep 2025", currency: "GBP", subtotal: "935.40", vat: "187.08", total: "1,122.48", lineItem: "Corrugated cases, 1500 units" },
  { supplier: "Aldgate Legal Services", address: "1 Minories Court, London EC3N 1AH", taxId: "GB905331276", invoiceNumber: "ALS-9903", issueDate: "04 Nov 2025", dueDate: "04 Dec 2025", currency: "GBP", subtotal: "6,250.00", vat: "1,250.00", total: "7,500.00", lineItem: "Contract review, retainer" },
];
