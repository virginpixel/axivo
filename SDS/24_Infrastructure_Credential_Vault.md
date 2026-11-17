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
- The Topology page draws the devices in tiers by hops from the
  best-connected switch, labels each line with its ports, and lists every
  cable in a table view. Clicking a device lists its ports. Another
  company's device at the far end of a visible cable shows only its name.
- Deleting a device removes its cables.

## Permissions
| Permission | Default roles |
|---|---|
| infrastructure.view | System Admin, IT Admin, IT Support, Read Only |
| infrastructure.manage | System Admin, IT Admin |
| infrastructure.credentials.manage | System Admin, IT Admin |
| infrastructure.credentials.reveal | System Admin |

## Audit
Device create, update, status change, delete, application links,
credential set create, update, password change, delete, link, unlink,
reveal, connection add, change and remove (on both devices' pages), and
each import.
