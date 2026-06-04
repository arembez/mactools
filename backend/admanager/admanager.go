package admanager

import (
	"bufio"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

type ADManager struct {
	configFile string
}

func NewADManager() *ADManager {
	return &ADManager{
		configFile: ".ad_join_config",
	}
}

func (a *ADManager) GetCurrentHostname() string {
	if runtime.GOOS != "darwin" {
		return "Not macOS"
	}

	cmd := exec.Command("scutil", "--get", "ComputerName")
	output, err := cmd.Output()
	if err != nil {
		cmd = exec.Command("uname", "-n")
		output, err = cmd.Output()
		if err != nil {
			return "Unknown"
		}
	}

	fullHostname := strings.TrimSpace(string(output))
	parts := strings.Split(fullHostname, ".")
	if len(parts) > 0 {
		return parts[0]
	}
	return fullHostname
}

func (a *ADManager) GetLocalHostname() string {
	if runtime.GOOS != "darwin" {
		return "Not macOS"
	}

	cmd := exec.Command("scutil", "--get", "LocalHostName")
	output, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

func (a *ADManager) GetHostname() string {
	if runtime.GOOS != "darwin" {
		return "Not macOS"
	}

	cmd := exec.Command("scutil", "--get", "HostName")
	output, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

func (a *ADManager) SetHostname(newName string) string {
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return "Error: Hostname cannot be empty"
	}

	localName := strings.ToLower(strings.ReplaceAll(newName, " ", "-"))
	localName = a.sanitizeLocalHostName(localName)

	var errors []string

	cmd := exec.Command("sudo", "scutil", "--set", "ComputerName", newName)
	if err := cmd.Run(); err != nil {
		errors = append(errors, fmt.Sprintf("Failed to set ComputerName: %v", err))
	}

	cmd = exec.Command("sudo", "scutil", "--set", "LocalHostName", localName)
	if err := cmd.Run(); err != nil {
		errors = append(errors, fmt.Sprintf("Failed to set LocalHostName: %v", err))
	}

	cmd = exec.Command("sudo", "scutil", "--set", "HostName", newName)
	if err := cmd.Run(); err != nil {
		errors = append(errors, fmt.Sprintf("Failed to set HostName: %v", err))
	}

	plistPath := "/Library/Preferences/SystemConfiguration/com.apple.smb.server.plist"

	createPlistCmd := fmt.Sprintf(`if [ ! -f %s ]; then echo '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict/></plist>' > %s; fi`, plistPath, plistPath)
	cmd = exec.Command("sudo", "sh", "-c", createPlistCmd)
	if err := cmd.Run(); err != nil {
		errors = append(errors, fmt.Sprintf("Warning: Could not create plist: %v", err))
	}

	setNetBIOSCmd := fmt.Sprintf("/usr/libexec/PlistBuddy -c 'Set :NetBIOSName %s' %s 2>/dev/null || /usr/libexec/PlistBuddy -c 'Add :NetBIOSName string %s' %s", newName, plistPath, newName, plistPath)
	cmd = exec.Command("sudo", "sh", "-c", setNetBIOSCmd)
	if err := cmd.Run(); err != nil {
		errors = append(errors, fmt.Sprintf("Warning: Could not set NetBIOS name: %v", err))
	}

	cmd = exec.Command("sudo", "chmod", "644", plistPath)
	if err := cmd.Run(); err != nil {
		errors = append(errors, fmt.Sprintf("Warning: Could not set plist permissions: %v", err))
	}

	shortname := newName
	if !strings.Contains(newName, ".") {
		shortname = newName + ".local"
	}

	updateHostsCmd := fmt.Sprintf(`sed -i '' '/%s/d' /etc/hosts 2>/dev/null; sed -i '' '/%s/d' /etc/hosts 2>/dev/null; echo '127.0.0.1	%s %s localhost' >> /etc/hosts; echo '::1	%s %s localhost' >> /etc/hosts`, newName, shortname, shortname, newName, shortname, newName)
	cmd = exec.Command("sudo", "sh", "-c", updateHostsCmd)
	if err := cmd.Run(); err != nil {
		errors = append(errors, fmt.Sprintf("Warning: Could not update hosts file: %v", err))
	}

	cmd = exec.Command("sudo", "killall", "-HUP", "mDNSResponder")
	_ = cmd.Run()

	cmd = exec.Command("sudo", "launchctl", "unload", "-w", "/System/Library/LaunchDaemons/com.apple.smbd.plist")
	_ = cmd.Run()

	cmd = exec.Command("sudo", "launchctl", "load", "-w", "/System/Library/LaunchDaemons/com.apple.smbd.plist")
	_ = cmd.Run()

	if len(errors) > 0 {
		return fmt.Sprintf("Partial success: %s", strings.Join(errors, "; "))
	}

	return fmt.Sprintf("Success: Hostname changed to %s", newName)
}

func (a *ADManager) SetFullHostname(computerName, localName, hostName string) string {
	computerName = strings.TrimSpace(computerName)
	localName = strings.TrimSpace(localName)
	hostName = strings.TrimSpace(hostName)

	if computerName == "" || localName == "" || hostName == "" {
		return "Error: All hostnames must be specified"
	}

	localName = a.sanitizeLocalHostName(strings.ToLower(localName))

	cmds := []struct {
		args []string
		desc string
	}{
		{[]string{"scutil", "--set", "ComputerName", computerName}, "ComputerName"},
		{[]string{"scutil", "--set", "LocalHostName", localName}, "LocalHostName"},
		{[]string{"scutil", "--set", "HostName", hostName}, "HostName"},
		{[]string{"defaults", "write", "/Library/Preferences/SystemConfiguration/com.apple.smb.server", "NetBIOSName", "-string", strings.Split(computerName, ".")[0]}, "NetBIOS"},
	}

	var errors []string
	for _, cmd := range cmds {
		if err := exec.Command("sudo", cmd.args...).Run(); err != nil {
			errors = append(errors, fmt.Sprintf("%s: %v", cmd.desc, err))
		}
	}

	if len(errors) > 0 {
		return fmt.Sprintf("Partial success. Errors: %v", strings.Join(errors, "; "))
	}

	if err := a.updateHostsFile(computerName); err != nil {
		return fmt.Sprintf("Hostnames set but hosts file update failed: %v", err)
	}

	return "Success: All hostnames updated"
}

func (a *ADManager) updateHostsFile(hostname string) error {
	fullName := hostname
	if !strings.Contains(hostname, ".") {
		fullName = hostname + ".local"
	}

	hostsFile := "/etc/hosts"

	cmd := exec.Command("sudo", "cat", hostsFile)
	content, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("failed to read hosts file: %v", err)
	}

	lines := strings.Split(string(content), "\n")
	var newLines []string
	hostnameShort := strings.Split(fullName, ".")[0]

	for _, line := range lines {
		if !strings.Contains(line, hostnameShort) &&
			!strings.Contains(line, fullName) &&
			line != "" {
			newLines = append(newLines, line)
		}
	}

	newLines = append(newLines, "127.0.0.1\t"+fullName+" "+hostnameShort+" localhost")
	newLines = append(newLines, "::1\t"+fullName+" "+hostnameShort+" localhost")

	newContent := strings.Join(newLines, "\n")
	cmd = exec.Command("sudo", "tee", hostsFile)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}

	go func() {
		defer stdin.Close()
		stdin.Write([]byte(newContent))
	}()

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to write hosts file: %v", err)
	}

	return nil
}

func (a *ADManager) GetDesiredHostname() (string, error) {
	cmd := exec.Command("system_profiler", "SPHardwareDataType")
	output, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("failed to get system info: %v", err)
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, "Serial Number") {
			parts := strings.Split(line, ":")
			if len(parts) > 1 {
				serial := strings.ToLower(strings.TrimSpace(parts[1]))
				if len(serial) >= 5 {
					last5 := serial[len(serial)-5:]
					return "nb-mac-" + last5, nil
				}
				return "", fmt.Errorf("serial number too short: %s", serial)
			}
		}
	}

	return "", fmt.Errorf("serial number not found")
}

func (a *ADManager) GetDomainStatus() map[string]interface{} {
	result := map[string]interface{}{
		"joined":   false,
		"domain":   "",
		"computer": "",
		"ou":       "",
		"mobile":   false,
		"groups":   []string{},
		"error":    nil,
	}

	cmd := exec.Command("dsconfigad", "-show")
	output, err := cmd.Output()
	if err != nil {
		result["error"] = "Not joined to domain or dsconfigad failed"
		return result
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, "Active Directory Domain") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) > 1 {
				domain := strings.TrimSpace(parts[1])
				if domain != "" {
					result["joined"] = true
					result["domain"] = strings.TrimSuffix(domain, ".")
				}
			}
		} else if strings.Contains(line, "Computer Account") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) > 1 {
				computer := strings.TrimSpace(parts[1])
				computer = strings.TrimSuffix(computer, "$")
				result["computer"] = computer
			}
		} else if strings.Contains(line, "Computer Organizational Unit") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) > 1 {
				result["ou"] = strings.TrimSpace(parts[1])
			}
		} else if strings.Contains(line, "Mobile Account") && strings.Contains(line, "Enabled") {
			result["mobile"] = true
		} else if strings.Contains(line, "Allowed admin groups") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) > 1 {
				groups := strings.TrimSpace(parts[1])
				if groups != "not set" {
					result["groups"] = strings.Split(groups, ",")
				}
			}
		}
	}

	return result
}

func (ad *ADManager) VerifyAdminPassword(password string) bool {
	if runtime.GOOS != "darwin" {
		return false
	}

	cmd := exec.Command("whoami")
	output, err := cmd.Output()
	if err != nil {
		return false
	}
	username := strings.TrimSpace(string(output))

	cmd = exec.Command("dscl", ".", "-authonly", username, password)
	err = cmd.Run()

	return err == nil
}

func (a *ADManager) JoinDomain(config map[string]interface{}) JoinDomainResult {
	domain, _ := config["domain"].(string)
	username, _ := config["username"].(string)
	password, _ := config["password"].(string)
	computerName, _ := config["computerName"].(string)
	ou, _ := config["ou"].(string)
	mobileAccount, _ := config["mobileAccount"].(bool)
	mobileConfirm, _ := config["mobileConfirm"].(bool)
	useUNCPath, _ := config["useUNCPath"].(bool)
	adminGroups, _ := config["adminGroups"].(string)
	packetSign, _ := config["packetSign"].(string)
	packetEncrypt, _ := config["packetEncrypt"].(string)
	namespace := "domain"
	preferredServer, _ := config["preferredServer"].(string)

	if domain == "" || username == "" || password == "" {
		return JoinDomainResult{Success: false, Error: "Domain, username and password are required"}
	}

	if computerName == "" {
		computerName = a.GetCurrentHostname()
		if computerName == "Unknown" || computerName == "Not macOS" {
			return JoinDomainResult{Success: false, Error: "Cannot determine current hostname"}
		}
	}

	if ou == "" {
		ou = "CN=Computers,DC=" + strings.ReplaceAll(domain, ".", ",DC=")
	}

	dsconfigadCmd := []string{"dsconfigad", "-add", domain, "-computer", computerName, "-username", username, "-password", password, "-ou", ou, "-force"}

	if mobileAccount {
		dsconfigadCmd = append(dsconfigadCmd, "-mobile", "enable")
	} else {
		dsconfigadCmd = append(dsconfigadCmd, "-mobile", "disable")
	}

	if mobileConfirm {
		dsconfigadCmd = append(dsconfigadCmd, "-mobileconfirm", "enable")
	} else {
		dsconfigadCmd = append(dsconfigadCmd, "-mobileconfirm", "disable")
	}

	if useUNCPath {
		dsconfigadCmd = append(dsconfigadCmd, "-useuncpath", "enable")
	} else {
		dsconfigadCmd = append(dsconfigadCmd, "-useuncpath", "disable")
	}

	if adminGroups != "" {
		dsconfigadCmd = append(dsconfigadCmd, "-groups", adminGroups)
	}

	if packetSign != "" {
		dsconfigadCmd = append(dsconfigadCmd, "-packetsign", packetSign)
	} else {
		dsconfigadCmd = append(dsconfigadCmd, "-packetsign", "allow")
	}

	if packetEncrypt != "" {
		dsconfigadCmd = append(dsconfigadCmd, "-packetencrypt", packetEncrypt)
	} else {
		dsconfigadCmd = append(dsconfigadCmd, "-packetencrypt", "allow")
	}

	if namespace != "" {
		dsconfigadCmd = append(dsconfigadCmd, "-namespace", namespace)
	} else {
		dsconfigadCmd = append(dsconfigadCmd, "-namespace", "domain")
	}

	if preferredServer != "" {
		dsconfigadCmd = append(dsconfigadCmd, "-preferred", preferredServer)
	}

	cmd := exec.Command("sudo", dsconfigadCmd...)
	output, err := cmd.CombinedOutput()

	resultOutput := strings.TrimSpace(string(output))

	if err != nil {
		return JoinDomainResult{
			Success: false,
			Message: "Failed to join domain",
			Error:   fmt.Sprintf("Command failed: %v - Output: %s", err, resultOutput),
		}
	}

	hostnameResult := a.SetHostname(computerName)

	return JoinDomainResult{
		Success: true,
		Message: "Successfully joined domain",
		Error:   "",
		Details: map[string]string{
			"dsconfigad_output":   resultOutput,
			"hostname_change":     hostnameResult,
			"domain":              domain,
			"computer_name":       computerName,
			"organizational_unit": ou,
		},
	}
}

func (a *ADManager) LeaveDomain(username, password string) JoinDomainResult {
	status := a.GetDomainStatus()
	if !status["joined"].(bool) {
		return JoinDomainResult{Success: false, Error: "Not joined to any domain"}
	}

	cmd := exec.Command("sudo", "dsconfigad", "-force", "-remove", "-username", username, "-password", password)
	output, err := cmd.CombinedOutput()

	if err != nil {
		return JoinDomainResult{
			Success: false,
			Message: "Failed to leave domain",
			Error:   fmt.Sprintf("%v: %s", err, string(output)),
		}
	}

	return JoinDomainResult{
		Success: true,
		Message: "Successfully left domain",
	}
}

func (a *ADManager) TestADConnectivity(domain string) map[string]interface{} {
	result := map[string]interface{}{
		"dns":     false,
		"ldap":    false,
		"srv":     false,
		"message": "",
	}

	cmd := exec.Command("nslookup", domain)
	if err := cmd.Run(); err == nil {
		result["dns"] = true
	} else {
		result["message"] = "DNS lookup failed"
	}

	cmd = exec.Command("dig", "+short", "SRV", fmt.Sprintf("_ldap._tcp.%s", domain))
	if output, err := cmd.Output(); err == nil && len(output) > 0 {
		result["ldap"] = true
	}

	srvRecords := []string{
		fmt.Sprintf("_ldap._tcp.%s", domain),
		fmt.Sprintf("_kerberos._tcp.%s", domain),
	}

	srvSuccess := true
	for _, srv := range srvRecords {
		cmd = exec.Command("dig", "+short", "SRV", srv)
		if err := cmd.Run(); err != nil {
			srvSuccess = false
			break
		}
	}
	result["srv"] = srvSuccess

	return result
}

func (a *ADManager) ChangeComputerName(newName, username, password string) JoinDomainResult {
	status := a.GetDomainStatus()
	if !status["joined"].(bool) {
		return JoinDomainResult{Success: false, Error: "Not joined to any domain"}
	}

	currentComputer := status["computer"].(string)
	if newName == currentComputer {
		return JoinDomainResult{Success: false, Error: "New name is same as current name"}
	}

	leaveResult := a.LeaveDomain(username, password)
	if !leaveResult.Success {
		return leaveResult
	}

	setResult := a.SetHostname(newName)
	if strings.Contains(setResult, "Error") {
		return JoinDomainResult{Success: false, Error: setResult}
	}

	return JoinDomainResult{
		Success: true,
		Message: "Computer name changed. Please rejoin domain with new name.",
	}
}

func (a *ADManager) SaveConfig(config map[string]interface{}) JoinDomainResult {
	file, err := os.Create(a.configFile)
	if err != nil {
		return JoinDomainResult{Success: false, Error: err.Error()}
	}
	defer file.Close()

	writer := bufio.NewWriter(file)
	for key, value := range config {
		switch v := value.(type) {
		case string:
			if v != "" && key != "password" {
				fmt.Fprintf(writer, "%s=%s\n", key, v)
			}
		case bool:
			fmt.Fprintf(writer, "%s=%v\n", key, v)
		}
	}

	if err := writer.Flush(); err != nil {
		return JoinDomainResult{Success: false, Error: err.Error()}
	}

	return JoinDomainResult{Success: true, Message: "Configuration saved"}
}

func (a *ADManager) LoadConfig() map[string]interface{} {
	config := make(map[string]interface{})

	file, err := os.Open(a.configFile)
	if err != nil {
		return config
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "=") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				key := strings.TrimSpace(parts[0])
				value := strings.TrimSpace(parts[1])

				if value == "true" || value == "false" {
					config[key] = value == "true"
				} else {
					config[key] = value
				}
			}
		}
	}

	return config
}

func (a *ADManager) CheckAdminRights() bool {
	cmd := exec.Command("id", "-Gn")
	output, err := cmd.Output()
	if err != nil {
		return false
	}

	groups := strings.Fields(string(output))
	for _, group := range groups {
		if group == "admin" {
			return true
		}
	}
	return false
}

func (a *ADManager) GetSystemInfo() map[string]interface{} {
	info := make(map[string]interface{})

	if out, err := exec.Command("sw_vers", "-productVersion").Output(); err == nil {
		info["macosVersion"] = strings.TrimSpace(string(out))
	}

	if out, err := exec.Command("whoami").Output(); err == nil {
		info["username"] = strings.TrimSpace(string(out))
	}

	info["architecture"] = runtime.GOARCH
	info["os"] = runtime.GOOS
	info["isAdmin"] = a.CheckAdminRights()

	cmd := exec.Command("scutil", "--get", "ComputerName")
	if output, err := cmd.Output(); err == nil {
		info["computerName"] = strings.TrimSpace(string(output))
	}

	cmd = exec.Command("scutil", "--get", "LocalHostName")
	if output, err := cmd.Output(); err == nil {
		info["localHostName"] = strings.TrimSpace(string(output))
	}

	cmd = exec.Command("scutil", "--get", "HostName")
	if output, err := cmd.Output(); err == nil {
		info["hostName"] = strings.TrimSpace(string(output))
	}

	return info
}

func (a *ADManager) sanitizeLocalHostName(name string) string {
	var result strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			result.WriteRune(r)
		}
	}

	sanitized := result.String()
	if sanitized == "" {
		return "mac"
	}

	sanitized = strings.Trim(sanitized, "-")
	if sanitized == "" {
		return "mac"
	}

	return sanitized
}

func (a *ADManager) ExecuteCommand(command string, args []string) map[string]interface{} {
	result := map[string]interface{}{
		"success": false,
		"output":  "",
		"error":   "",
	}

	cmd := exec.Command(command, args...)
	output, err := cmd.CombinedOutput()

	if err != nil {
		result["error"] = err.Error()
	} else {
		result["success"] = true
	}

	result["output"] = string(output)
	return result
}

func (a *ADManager) ExecuteSudoCommand(command string, args []string) map[string]interface{} {
	result := map[string]interface{}{
		"success": false,
		"output":  "",
		"error":   "",
	}

	cmd := exec.Command("sudo", append([]string{command}, args...)...)
	output, err := cmd.CombinedOutput()

	if err != nil {
		result["error"] = err.Error()
	} else {
		result["success"] = true
	}

	result["output"] = string(output)
	return result
}

func (a *ADManager) RestartService(serviceName string) JoinDomainResult {
	args := []string{"launchctl", "kickstart", "-k", fmt.Sprintf("system/%s", serviceName)}

	cmd := exec.Command("sudo", args...)
	output, err := cmd.CombinedOutput()

	if err != nil {
		return JoinDomainResult{
			Success: false,
			Message: fmt.Sprintf("Failed to restart %s", serviceName),
			Error:   fmt.Sprintf("%s: %s", err.Error(), string(output)),
		}
	}

	return JoinDomainResult{
		Success: true,
		Message: fmt.Sprintf("Service %s restarted successfully", serviceName),
	}
}

func (a *ADManager) RebootSystem() JoinDomainResult {
	cmd := exec.Command("sudo", "shutdown", "-r", "now")
	err := cmd.Run()

	if err != nil {
		return JoinDomainResult{
			Success: false,
			Message: "Failed to reboot system",
			Error:   err.Error(),
		}
	}

	return JoinDomainResult{
		Success: true,
		Message: "System rebooting...",
	}
}

func (a *ADManager) ValidateDomain(domain string) bool {
	if domain == "" {
		return false
	}
	parts := strings.Split(domain, ".")
	if len(parts) < 2 {
		return false
	}
	for _, part := range parts {
		if part == "" {
			return false
		}
	}
	return true
}

func (a *ADManager) GetNetworkInfo() map[string]interface{} {
	info := make(map[string]interface{})

	cmd := exec.Command("networksetup", "-getinfo", "Ethernet")
	if output, err := cmd.Output(); err == nil {
		info["ethernet"] = string(output)
	}

	cmd = exec.Command("networksetup", "-getinfo", "Wi-Fi")
	if output, err := cmd.Output(); err == nil {
		info["wifi"] = string(output)
	}

	cmd = exec.Command("scutil", "--dns")
	if output, err := cmd.Output(); err == nil {
		info["dns"] = string(output)
	}

	return info
}
