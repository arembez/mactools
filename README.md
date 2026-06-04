# Mac Tools

A macOS system management utility built with Wails, Go, and React. Mac Tools provides an intuitive graphical interface for managing Active Directory domain operations, printer configuration, and essential system settings.

## Overview

Mac Tools simplifies macOS administration through a native desktop application that bridges Go backend performance with a modern React frontend. The application is designed for IT administrators and power users who need to manage Mac computers in enterprise environments, particularly those with Active Directory integration requirements.

> **Note**: This project is currently in active development. While the core functionality is implemented, some features may evolve or expand in future releases.

## Features

- **Active Directory Management**
  - Join/leave domains with administrative credentials
  - Hostname configuration (ComputerName, LocalHostName, HostName)
  - NetBIOS name management
  - Domain connectivity testing
  - Configuration saving and loading

- **Printer Management**
  - View installed printers with status, model, and location information
  - CUPS server integration for network printer discovery
  - Detect default printer and sharing status

- **System Utilities**
  - Restart computer directly from the application
  - Extend sudo session timeout
  - Verify administrative rights and passwords
  - View system information

- **Modern Interface**
  - Native macOS appearance with transparent title bar option
  - Responsive layout with adjustable window size
  - Built with React and Vite for fast, reactive UI

## Prerequisites

- **macOS** – The application is specifically designed for macOS. Some features (particularly Active Directory operations) rely on macOS‑specific commands and will not function correctly on other operating systems.

## Usage

Once launched, Mac Tools presents a main window with the following functional areas:

1. **Active Directory Tab** – Use this section to:
   - View and modify the computer’s hostname settings
   - Join a computer to an Active Directory domain
   - Leave a domain (requires domain administrator credentials)
   - Test connectivity to a specified domain
   - Save and load AD configuration profiles

2. **Printers Tab** – Manage printer configurations:
   - List all installed printers with status, model, location, and URI
   - Identify default and shared printers
   - Add or remove printers (future functionality)

3. **System Tab** – Perform system operations:
   - Restart the computer
   - Extend sudo session timeouts
   - Verify administrative rights
   - View system information (macOS version, hardware details, etc.)

### Admin Rights

Many operations (including domain joins, hostname changes, and system restarts) require administrator privileges. The application will prompt for administrative credentials when necessary.
