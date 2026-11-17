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
  group (the core): its branches go out on both sides of it, and every
  switch's own branches sit in the column right next to it, so a line
  never crosses another switch's branch. Each line is labelled with its
  ports, and every cable is also listed in a table view. Clicking a
  device lists its ports. Another company's device at the far end of a
  visible cable shows only its name.
- Deleting a device removes its cables.

## Configuration backups
- Every night at the hour set on the Config backups page (organisation
  timezone; default 02:00), the worker backs up each active network
  device that is included (the default) and has an IP address and an
  SSH login linked. A device's login is the linked credential set whose
  purpose is SSH, else the first that is not for a web UI or enable; a
  set with purpose Enable gives the enable password, else the login's
  own password is tried.
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
- The IP & VLANs page lists each VLAN with its subnets, gateway and how
  full each subnet is, flags subnets that overlap another of the same
  company, and finds any IP address: the subnets holding it, its record
  and the devices using it. A subnet's page shows its range, a map of
  every address (up to /22), the next free address and every recorded
  address, including devices in the register that use one. A device's
  page shows the subnet and VLAN of its IP address.
- Import → VLANs & IPs reads a VLAN plan (the discovery "VLAN plan"
  sheet, or headings like VLAN, Name, Subnet, Gateway) and an address
  list (the "Live devices" sheet, or IP, DNS name, MAC, Switch, Port).
  The site or company column is matched to a company by name. An
  address goes to the company whose most specific subnet holds it;
  addresses outside every known subnet are left out. Re-importing
  renames VLANs and updates subnets to match the file; for an address
  it takes what discovery saw and keeps its status and description.
- Deleting a VLAN keeps its subnets; deleting a subnet keeps the
  addresses recorded in it. Every change, and each import, is audited.

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
