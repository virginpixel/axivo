# Axivo Software Design Specification

# Document 24 – Infrastructure & Credential Vault

## Purpose
Keep one register of the IT estate (network devices, servers and hosts)
and the logins used to manage it, replacing the network and server
spreadsheets the IT team keeps today. Scope is set by Document 00 §14.

## Device types
Configurable in Settings, Device Types. Each type belongs to one kind:

- **Network**: Switch, Firewall, Router, Wireless Controller, Access Point
- **Server**: Physical Server, Virtual Machine, Hypervisor, NAS / Storage, Appliance, Workstation

A type in use cannot be deleted; it can be deactivated.

## Device fields
- Company (required, cannot change after creation)
- Device type (required; sets the kind)
- Name (required, unique per company)
- Hostname (the real DNS name when it differs from the name)
- IP address (IPv4 or IPv6)
- Location (nested company locations)
- Manufacturer, Model, Serial number
- Operating system, Version / firmware
- Domain
- Purpose
- Runs on (the host of a virtual machine; same company)
- Status: Active, Standby, Decommissioned
- Notes

Servers may list the Applications that run on them.

## Services
A server lists what it offers on the network: each Docker stack on a
container host, a web app, a database.

- A service has a name (unique per server, ignoring capitals), its
  ports, an address and notes. Ports are written as people type them
  ("9443", "80, 443", "8000-8010", "53/udp"); each must be 1 to 65535 and
  they are saved in one spelling ("9443, 8000-8010/tcp"). An address
  starts with http:// or https:// and opens in a new tab.
- Services are recorded on servers and hosts only, need
  `infrastructure.manage`, and each change is on the server's history.
- Searching Servers & hosts also matches a service's name, ports or
  address; the server shows with the services that matched.

Two devices may share an IP address (a standby clone takes over its
primary's address). The device page points it out rather than blocking it.

## Credential vault
A credential set holds a username and an encrypted password. It belongs
to one company or is shared by all companies, and can be linked to any
number of devices with a purpose label (SSH, Web UI, Enable, iLO...).

- Passwords are encrypted with AES-256-GCM (Document 05 Ch10).
- Lists, the device page and exports never include passwords.
- Revealing a password requires `infrastructure.credentials.reveal`;
  each reveal is audited (`credential.revealed`) and the value hides
  itself again after 30 seconds.
- Setting or changing a password requires
  `infrastructure.credentials.manage` and is audited without the value.

## Import
Upload an .xlsx or .csv file, review a preview, then import.

- Columns are recognised by their headings (Name/Description/Hostname,
  IP Address/Mgmt IP, Company/Property, Vendor/Manufacturer, Model,
  Serial, OS, Firmware/Version, Domain, Location, Remark/Notes, Username,
  Password).
- Each distinct company value (or name prefix when there is no company
  column) is mapped to a company; each distinct type value (or OS when
  there is no type column) is mapped to a device type.
- Devices that already exist (same company and name) are updated or
  skipped, as chosen.
- Rows carrying a login are grouped: identical username and password
  within a company become one credential set. Passwords stay on the
  server; the preview shows only the grouping.
- The file is read again on import, so nothing sensitive is held between
  the two steps.

## Connections and topology
A connection is one cable: a port on one device to a port on another.

- Ports are stored in one spelling (GigabitEthernet1/0/1 → Gi1/0/1) so a
  cable typed by hand and the same cable read from CDP agree.
- A port carries one cable. A cable may go from a device back to itself
  on two different ports; this records a loop and is shown in red.
- Connections are added and edited on a device's page or on the
  Topology page, and need `infrastructure.manage`. A user outside the
  System Administrator role only connects devices of their own company.
- Import (Import → Connections) reads a neighbour table: device, local
  port, neighbour, neighbour port, and optionally the IP addresses and
  neighbour type. Names are matched first (ignoring the domain suffix),
  then IP addresses. A cable reported by both switches is recorded once.
  Rows naming a device that is not in the register are listed and left
  out. A new cable on a port that already had a different one replaces
  it. Imported cables that a later table no longer shows can be removed,
  on request; cables added by hand are never removed by an import.
- The Topology page grows a tree from the best-connected switch of each
  group (the core): its branches go out on both sides of it, each side a
  run of names cut so a family (BOH-BLK-C-SW01, SW02, ...) stays on one
  side. Every switch's children sit in one column right next to it, in
  name order, so a line never crosses another switch's branch. A switch's
  cables share one trunk and turn into each child at a right angle, the
  port label on that last run; a second uplink or a ring is drawn as a
  curve. Each line is labelled with its
  ports, and every cable is also listed in a table view. Clicking a
  device lists its ports. Another company's device at the far end of a
  visible cable shows only its name.
- The page shows how many devices and cables are on the map next to the
  Map / Cable list switch; choosing a company redraws it at once. Devices
  without any cable are not drawn. A loop shows in red on the device.
- Deleting a device removes its cables.

## Configuration backups
- Every night at the hour set on the Config backups page (organisation
  timezone; default 02:00), the worker backs up each active network
  device that is included (the default) and has an IP address and an
  SSH login linked. The logins tried are the linked credential sets whose
  purpose is SSH, the one linked first leading; when none is marked SSH,
  those not for a web UI, iLO, SNMP, OS admin or enable. A set with
  purpose Enable gives the enable password, else the login's own
  password is tried.
- When a login is refused, lacks enable rights or shows no
  configuration, the next login is tried. A device that cannot be
  reached is not tried again with another login. If a later login gets
  in, the result says which one and why the earlier ones failed; if
  none does, it names each login and its reason. The ARP reading tries
  logins the same way.
- It logs in, enters enable mode when the device starts at `>`, turns
  paging off, and runs only `show version`, the family's identity
  command (`show inventory` / `show system`) and `show running-config`.
  Supported: Cisco IOS and IOS XE, Cisco small business, Aruba/HP
  ProCurve and ArubaOS-CX. Nothing on the device is ever changed.
- A new copy is stored, encrypted, only when the configuration differs
  from the last one, ignoring lines that change by themselves (the last
  change timestamp, the NTP clock period). Each copy records the lines
  added and removed and the firmware at the time.
- Model, serial number, operating system and firmware in the register
  are set from what the device reports, with the change in the device's
  history. A changed serial number is flagged as possibly replaced
  hardware. On the linked asset only empty model and serial fields are
  filled in.
- Each device keeps the result of its last attempt (saved, failed with
  the reason, or not set up). One device failing never stops the others.
- A user with `infrastructure.manage` may back up one device or all
  included devices of their company at once, and leave a device out of
  the nightly run. The schedule needs `settings.manage`.
- Opening, comparing or downloading a saved configuration needs
  `infrastructure.configs.view` and is audited on the device.
- The Config backups page can be searched by device, IP address, company
  or message. A device left out of the nightly run shows "Left out" and
  that its backup is switched off, not the reason its last try failed.

## Lists
- Every list in Infrastructure (network devices, servers, credential
  sets, a set's devices, config backups, VLANs, subnets, a subnet's
  addresses, cables, and a device's logins, cables, saved copies and
  guests) sorts by any column but the actions. IP addresses and subnets
  sort in address order, names with numbers in natural order (SW2 before
  SW10), and empty values stay at the bottom either way.
- Long lists are paged (50 rows; 25 for a credential set's devices). The
  sort covers every row, not only the page shown. A new search or filter
  goes back to the first page.
- On the topology map, a device's border turns green under the pointer.

## Devices and assets
- A device may be linked to one asset of the same company. The device
  form can create the asset (name, serial number, manufacturer, model
  and location copied from the device; category and tag chosen), link
  an existing one by tag, serial number or name, or unlink it. Creating
  an asset also needs `assets.manage`.
- Link to assets (on each register) links every device without an
  asset: to the unlinked asset with the same serial number, else the
  same name, else a new asset in a chosen category. It shows the result
  per device before anything is changed.
- A linked asset is In Use (Document 11): a new one is created In Use,
  an Available one becomes In Use when linked, and an In Use one goes
  back to Available when unlinked. Other statuses are left alone.
- An asset's page links to its device. Deleting a device leaves its
  asset in place.

## IP & VLAN plan
- VLANs belong to a company: number 1-4094 (unique within the company),
  name, purpose, status (Active, Reserved, Not in use) and notes.
- Subnets are IPv4, written as network/prefix or network and mask. An
  address that is not the network address is refused, with the network
  it probably means. Size, mask, usable range and broadcast are always
  calculated. A subnet may have a VLAN, gateway (inside the subnet),
  DHCP relay, location, purpose and status, and is unique per company.
- Addresses are recorded per company, unique within it, as Used or
  Reserved, with name, MAC address and vendor, the device they belong
  to, the switch and port discovery saw them on, and when.
- The IP & VLANs page lists each VLAN with its subnets and gateway,
  flags subnets that overlap another of the same company, and finds any IP address: the subnets holding it, its record
  and the devices using it. A subnet's page shows its range, a map of
  every address up to /22 (pointing at a square shows its IP and what is
  known about it) and every recorded address, including devices in the
  register that use one.
- ARP reading: each subnet can have "Read the ARP table every night"
  turned on (off by default), and Scan now reads it at once. The worker
  logs in to the switch that routes the subnet, with the read-only login
  of the configuration backup, and runs only `show ip arp` (`show arp` on
  other families); nothing is sent to the devices. That switch is found
  from the interface addresses in the saved configurations (kept on each
  device at every backup), or chosen on the subnet. Each address found is
  recorded as Used with its MAC address, or has its MAC and "last seen"
  refreshed; status, name and description stay as they were. Nothing is
  ever removed. An address found by discovery or an ARP read and not seen
  for 30 days is shown faded. The nightly read runs right after the
  configuration backup, at the same hour. Only devices that talk through
  the gateway appear; the page says so. A device's
  page shows the subnet and VLAN of its IP address.
- Import → VLANs & IPs reads a VLAN plan (the discovery "VLAN plan"
  sheet, or headings like VLAN, Name, Subnet, Gateway) and an address
  list (the "Live devices" sheet, or IP, DNS name, MAC, Switch, Port).
  The site or company column is matched to a company by name. An
  address goes to the company whose most specific subnet holds it;
  addresses outside every known subnet are left out. Re-importing
  renames VLANs and updates subnets to match the file; for an address
  it takes what discovery saw and keeps its status and description.
  Notes, remarks and discovery's "Known as" column are not imported: they
  describe the sheet, not the network.
- Deleting a VLAN keeps its subnets; deleting a subnet keeps the
  addresses recorded in it. Every change, and each import, is audited.

## Sample files
Every import (network devices, servers, connections, VLAN plan, address
list) offers a sample file: the headings that import reads, two example
rows with the company names in Axivo, and a "How to fill" tab saying what
each column takes. The import ignores that tab.

## Permissions
| Permission | Default roles |
|---|---|
| infrastructure.view | System Admin, IT Admin, IT Support, Read Only |
| infrastructure.manage | System Admin, IT Admin |
| infrastructure.credentials.manage | System Admin, IT Admin |
| infrastructure.credentials.reveal | System Admin |
| infrastructure.configs.view | System Admin, IT Admin |

## Audit
Device create, update, status change, delete, application links,
credential set create, update, password change, delete, link, unlink,
reveal, connection add, change and remove (on both devices' pages),
each import, asset link and unlink, each configuration backup run, a
configuration saved or changed, register fields updated from the
device, a device included in or left out of the nightly run, and every
opening, comparison or download of a saved configuration, and every
VLAN, subnet and address change.
