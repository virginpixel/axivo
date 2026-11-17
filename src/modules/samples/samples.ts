import ExcelJS from "exceljs";
import { db } from "@/shared/db";

/**
 * Sample files for every spreadsheet import (SDS Docs 24 and 25): the
 * headings each importer recognises and two example rows, so a sheet filled
 * in from the sample always matches. A "How to fill" tab explains each
 * column; it is never read by the importers.
 */

export const SAMPLE_KINDS = ["network-devices", "servers", "connections", "vlans", "ip-addresses", "opex", "capex"] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

interface Sample {
  file: string;
  sheet: string;
  /** Rows written before the headings (the CAPEX list starts with its department). */
  before?: (string | number | null)[][];
  headings: string[];
  rows: (string | number | null)[][];
  help: [string, string, string][];
}

async function names() {
  const [companies, network, servers] = await Promise.all([
    db.company.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { name: "asc" }, select: { name: true }, take: 2 }),
    db.infraDeviceType.findMany({ where: { deletedAt: null, isActive: true, kind: "NETWORK" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } }),
    db.infraDeviceType.findMany({ where: { deletedAt: null, isActive: true, kind: "SERVER" }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { name: true } }),
  ]);
  return {
    company: companies[0]?.name ?? "Your company",
    other: companies[1]?.name ?? companies[0]?.name ?? "Your company",
    network: network.map((t) => t.name),
    servers: servers.map((t) => t.name),
  };
}

async function sample(kind: SampleKind): Promise<Sample> {
  const n = await names();
  const companyHelp: [string, string, string] = ["Company", "Yes", `As named in Axivo, e.g. ${n.company}. Matched by name.`];
  switch (kind) {
    case "network-devices":
      return {
        file: "Network devices sample.xlsx",
        sheet: "Network devices",
        headings: ["Company", "Name", "Device type", "IP address", "Hostname", "Manufacturer", "Model", "Serial number", "Operating system", "Firmware", "Location", "Purpose", "Status", "Username", "Password"],
        rows: [
          [n.company, "BOH-ADMIN-SW01", n.network[0] ?? "Switch", "10.100.200.25", "", "Cisco", "C9200L-24P-4G", "JAE00000001", "Cisco IOS-XE", "17.09.04", "BOH Data Center", "Admin block access", "Active", "", ""],
          [n.company, "BOH-FW-01", n.network.find((t) => /firewall/i.test(t)) ?? n.network[0] ?? "Firewall", "10.100.200.1", "", "Fortinet", "FortiGate 201F", "FG201F0000001", "FortiOS", "7.2.8", "BOH Data Center", "Internet edge", "Active", "", ""],
        ],
        help: [
          companyHelp,
          ["Name", "Yes", "The device's name. Must be unique within the company."],
          ["Device type", "Yes", `One of: ${n.network.join(", ") || "the types in Settings"}.`],
          ["IP address", "No", "Management IP, e.g. 10.100.200.25."],
          ["Hostname", "No", "Only when the DNS name differs from the name."],
          ["Manufacturer, Model, Serial number", "No", "As on the label or from the device."],
          ["Operating system, Firmware", "No", "Filled in by the nightly backup once a login is linked."],
          ["Location", "No", "A location of the company, as named in Organization."],
          ["Purpose", "No", "What it is for, in a few words."],
          ["Status", "No", "Active, Standby or Decommissioned. Active when empty."],
          ["Username, Password", "No", "The login. Stored encrypted and grouped into credential sets; never shown back. Leave empty to link logins later."],
        ],
      };
    case "servers":
      return {
        file: "Servers sample.xlsx",
        sheet: "Servers",
        headings: ["Company", "Name", "Device type", "IP address", "Hostname", "Domain", "Manufacturer", "Model", "Serial number", "Operating system", "Version", "Location", "Purpose", "Status", "Username", "Password"],
        rows: [
          [n.company, "CXR-FS", n.servers.find((t) => /virtual/i.test(t)) ?? n.servers[0] ?? "Virtual machine", "10.100.100.150", "crvfs1", "crossroadsmaldives.local", "", "", "", "Windows Server 2022", "21H2", "BOH Data Center", "File server", "Active", "", ""],
          [n.company, "PVE-01", n.servers.find((t) => /hyper|physical/i.test(t)) ?? n.servers[0] ?? "Physical server", "10.100.100.10", "", "", "HPE", "ProLiant DL380 Gen10", "CZ00000001", "Proxmox VE", "8.2", "BOH Data Center", "Hypervisor", "Active", "", ""],
        ],
        help: [
          companyHelp,
          ["Name", "Yes", "The server's name. Must be unique within the company."],
          ["Device type", "Yes", `One of: ${n.servers.join(", ") || "the types in Settings"}.`],
          ["IP address, Hostname, Domain", "No", "Hostname only when the DNS name differs from the name."],
          ["Manufacturer, Model, Serial number", "No", "For physical servers."],
          ["Operating system, Version", "No", "e.g. Windows Server 2022, 21H2."],
          ["Location, Purpose", "No", "Location as named in Organization; purpose in a few words."],
          ["Status", "No", "Active, Standby or Decommissioned. Active when empty."],
          ["Username, Password", "No", "Stored encrypted and grouped into credential sets; never shown back."],
        ],
      };
    case "connections":
      return {
        file: "Connections sample.xlsx",
        sheet: "Neighbours",
        headings: ["Switch", "Local port", "Neighbour", "Neighbour port", "Switch IP", "Neighbour IP", "Neighbour type"],
        rows: [
          ["BOH_DC_Core_SW1", "Te1/0/14", "BOH-ADMIN-SW01", "Gi1/1/1", "10.100.10.254", "10.100.200.25", "Switch"],
          ["BOH-ADMIN-SW01", "Gi1/0/48", "BOH-ADMIN-SW02", "Gi1/0/48", "10.100.200.25", "10.100.200.26", "Switch"],
        ],
        help: [
          ["Switch", "Yes", "A device already in the register (name or IP)."],
          ["Local port", "Yes", "Its port, e.g. Gi1/0/1 or GigabitEthernet1/0/1."],
          ["Neighbour", "Yes", "The device at the other end. Neighbours not in the register are listed and left out."],
          ["Neighbour port", "Yes", "The other end's port."],
          ["Switch IP, Neighbour IP", "No", "Used when a name does not match."],
          ["Neighbour type", "No", "e.g. Switch, Access point. Shown for neighbours left out."],
        ],
      };
    case "vlans":
      return {
        file: "VLAN plan sample.xlsx",
        sheet: "VLAN plan",
        headings: ["Site", "VLAN", "Name", "Subnet", "Gateway", "DHCP relay", "Status", "Purpose"],
        rows: [
          [n.company, 10, "BOH_ADMIN", "10.100.10.0/23", "10.100.10.254", "10.100.100.10", "Active", "Admin offices"],
          [n.company, 42, "BOH_SOLAR", "10.100.42.0/24", "", "", "Reserved", "Solar inverters"],
        ],
        help: [
          ["Site", "Yes", `The company, as named in Axivo, e.g. ${n.company}.`],
          ["VLAN", "Yes", "1 to 4094."],
          ["Name", "Yes", "The VLAN's name."],
          ["Subnet", "No", "network/prefix, e.g. 10.100.10.0/23. Must be the network address."],
          ["Gateway, DHCP relay", "No", "IP addresses. The gateway must be inside the subnet."],
          ["Status", "No", "Active, Reserved or Not in use. Active when empty."],
          ["Purpose", "No", "What it is for."],
        ],
      };
    case "ip-addresses":
      return {
        file: "Address list sample.xlsx",
        sheet: "Addresses",
        headings: ["IP", "DNS name", "MAC", "Vendor", "Switch", "Port", "Status", "Description"],
        rows: [
          ["10.100.100.150", "crvfs1", "bc:24:11:0f:f4:2c", "Proxmox", "BOH_DC_Core_SW1", "Gi1/0/10", "Used", "File server"],
          ["10.100.100.160", "", "", "", "", "", "Reserved", "New backup server"],
        ],
        help: [
          ["IP", "Yes", "Kept only when it falls inside a subnet already in the plan, which also decides its company."],
          ["DNS name, MAC, Vendor", "No", "What is known about the device."],
          ["Switch, Port", "No", "Where it is plugged in."],
          ["Status", "No", "Used or Reserved. Used when empty."],
          ["Description", "No", "A few words about it."],
        ],
      };
    case "opex":
      return {
        file: "OPEX sample.xlsx",
        sheet: "OPEX",
        headings: ["#", "Department", "Product Name", "Vendor", "Used by", ...MONTHS, "Total Amount per Year", "Remark"],
        rows: [
          [1, "IT", "Microsoft 365", "Pacific Technologies", "All offices", ...Array(12).fill(916.67), 11000, "Business Standard licences"],
          [2, "IT", "Internet", "Dhiraagu", "Whole resort", ...Array(11).fill(15000), 20000, 185000, ""],
        ],
        help: [
          ["#", "No", "A reference number."],
          ["Department", "No", "Whose application or service it is."],
          ["Product Name", "Yes", "The product or service."],
          ["Vendor", "No", "Vendors not yet in Settings are added."],
          ["Used by", "No", "Who uses it: a department, outlet or place, e.g. Front Office."],
          ["January to December", "Yes", "The amount in USD for each month. Equal months become an even spread."],
          ["Total Amount per Year", "No", "Used when given; otherwise the months are added up."],
          ["Remark", "No", "Kept as the line's note."],
        ],
      };
    case "capex":
      return {
        file: "CAPEX sample.xlsx",
        sheet: "CAPEX",
        before: [["IT DEPARTMENT"]],
        headings: ["Ref#", "Description", "Priority Order", "Used by", "Asset Category", "CAPEX types", "Q'ty", "Unit Price", "Associated Cost", "Total Amount", "Required Period", "Reasons/Justification"],
        rows: [
          [null, "HARDWARE"],
          ["IT-01", "UniFi U6-Pro Access Point", "First Priority", "HR", "", "New Operation Enhancement", 5, 400, null, 2000, "Q1", "Reliable Wi-Fi in staff accommodation."],
          ["IT-02", "HP EliteBook", "Medium Priority", "IT", "", "Regular Replacement", 4, 1800, 200, 7400, "Q2", "Replacing laptops older than five years."],
        ],
        help: [
          ["(row above the headings)", "No", "The department, e.g. IT DEPARTMENT. Start a new section with its own headings for another department."],
          ["(a row with only a word under Description)", "No", "A group such as HARDWARE or SOFTWARE; it becomes the category of the items under it."],
          ["Ref#", "No", "e.g. IT-01."],
          ["Description", "Yes", "The item."],
          ["Priority Order", "No", "First Priority, Medium Priority or Wish List."],
          ["Used by", "No", "Who will use the item, e.g. HR, IT, Warehouse. Your own sheets' Location Code column is read the same way."],
          ["CAPEX types", "No", "Revenue Generating, Cost Saving, Regular Replacement, New Operation Enhancement or Others."],
          ["Q'ty, Unit Price", "Yes", "Quantity and price in USD."],
          ["Associated Cost", "No", "Shipping, installation."],
          ["Total Amount", "No", "Worked out from the above; kept when a unit price was rounded."],
          ["Required Period", "No", "Q1 to Q4."],
          ["Reasons/Justification", "No", "Why it is needed."],
        ],
      };
  }
}

/** The sample workbook for an import, ready to send. */
export async function buildSample(kind: SampleKind): Promise<{ file: string; buffer: Buffer }> {
  const s = await sample(kind);
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(s.sheet);
  for (const row of s.before ?? []) sheet.addRow(row);
  const header = sheet.addRow(s.headings);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EAF6" } };
  });
  for (const row of s.rows) sheet.addRow(row);
  sheet.columns.forEach((column, index) => {
    const widest = Math.max(...[s.headings[index] ?? "", ...s.rows.map((r) => String(r[index] ?? ""))].map((v) => v.length));
    column.width = Math.min(Math.max(widest + 2, 10), 40);
  });
  sheet.views = [{ state: "frozen", ySplit: (s.before?.length ?? 0) + 1 }];

  const help = book.addWorksheet("How to fill");
  const top = help.addRow(["Column", "Required", "What to write"]);
  top.font = { bold: true };
  for (const line of s.help) help.addRow(line);
  help.getColumn(1).width = 34;
  help.getColumn(2).width = 10;
  help.getColumn(3).width = 90;
  help.addRow([]);
  help.addRow(["Replace the example rows with your own, keep the headings as they are, and import the file."]);
  return { file: s.file, buffer: Buffer.from(await book.xlsx.writeBuffer()) };
}
