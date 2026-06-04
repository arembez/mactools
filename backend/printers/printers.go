package printers

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

type Printer struct {
	Name        string `json:"name"`
	Location    string `json:"location"`
	Description string `json:"description"`
	Model       string `json:"model"`
	Status      string `json:"status"`
	URI         string `json:"uri"`
	Driver      string `json:"driver"`
	Queue       string `json:"queue"`
	IsShared    bool   `json:"isShared"`
	IsDefault   bool   `json:"isDefault"`
	IsInstalled bool   `json:"isInstalled"`
}

type PrinterInstallResult struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Error   string `json:"error,omitempty"`
}

type SystemProfilerPrinter struct {
	Name        string      `json:"_name"`
	URI         string      `json:"uri"`
	Type        string      `json:"type"`
	Shared      interface{} `json:"shared"`
	Default     interface{} `json:"default"`
	Location    string      `json:"location"`
	Model       string      `json:"model"`
	Status      string      `json:"status"`
	PrintServer string      `json:"print_server"`
	PPDName     string      `json:"ppd_name"`
	PPDPath     string      `json:"ppd_path"`
}

type SystemProfilerOutput struct {
	SPPrintersDataType []SystemProfilerPrinter `json:"SPPrintersDataType"`
}

type PrinterManager struct {
	cupsURL string
	client  *http.Client
}

func NewPrinterManager() *PrinterManager {
	return &PrinterManager{
		cupsURL: "http://cups.blotus.ru:631",
		client: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: nil,
			},
		},
	}
}

func (pm *PrinterManager) SetCUPSURL(url string) {
	pm.cupsURL = url
}

func parseBoolFromInterface(val interface{}) bool {
	if val == nil {
		return false
	}

	switch v := val.(type) {
	case bool:
		return v
	case string:
		return v == "yes" || v == "true" || v == "1"
	default:
		return false
	}
}

func (pm *PrinterManager) GetPrinters() ([]Printer, error) {
	prnCUPS, err := pm.getCUPSPrinters()
	if err != nil {
		fmt.Printf("Warning: failed to get printers from CUPS: %v\n", err)
		prnCUPS = make(map[string]Printer)
	}

	prnInstalled, err := pm.getInstalledPrinters()
	if err != nil {
		fmt.Printf("Warning: failed to get installed printers: %v\n", err)
		prnInstalled = make(map[string]Printer)
	}

	merged := make(map[string]Printer)

	for key, printer := range prnInstalled {
		merged[key] = printer
	}

	for key, printer := range prnCUPS {
		if _, exists := merged[key]; !exists {
			merged[key] = printer
		}
	}

	var printers []Printer
	for _, printer := range merged {
		printers = append(printers, printer)
	}

	return printers, nil
}

func (pm *PrinterManager) getCUPSPrinters() (map[string]Printer, error) {
	url := fmt.Sprintf("%s/printers/", pm.cupsURL)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml")

	resp, err := pm.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to CUPS server: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("CUPS server returned status: %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	re := regexp.MustCompile(`HREF="(/printers/[^"]+)"`)
	matches := re.FindAllStringSubmatch(string(body), -1)

	var printers = make(map[string]Printer)

	for _, match := range matches {
		if len(match) > 1 {
			fullPath := strings.TrimSpace(match[1])
			printerName := strings.TrimPrefix(fullPath, "/printers/")

			if printerName != "" && !strings.HasPrefix(printerName, ".") {
				printerURI := strings.Replace(pm.cupsURL, "http://", "ipp://", 1)
				printerURI = regexp.MustCompile(`:\d+`).ReplaceAllString(printerURI, "")
				printerURI = fmt.Sprintf("%s/printers/%s", printerURI, printerName)

				printers[printerURI] = Printer{
					Name:        printerName,
					URI:         printerURI,
					IsInstalled: false,
				}
			}
		}
	}

	if len(printers) == 0 {
		return nil, fmt.Errorf("no printers found in CUPS response")
	}

	return printers, nil
}

func (pm *PrinterManager) getInstalledPrinters() (map[string]Printer, error) {
	cmd := exec.Command("system_profiler", "SPPrintersDataType", "-json")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to run system_profiler: %w", err)
	}

	var profilerOutput struct {
		SPPrintersDataType []SystemProfilerPrinter `json:"SPPrintersDataType"`
	}
	if err := json.Unmarshal(output, &profilerOutput); err != nil {
		return nil, fmt.Errorf("failed to parse system_profiler output: %w", err)
	}

	queueNames, err := getQueueNames()
	if err != nil {
		fmt.Printf("Warning: failed to get queue names: %v\n", err)
		queueNames = make(map[string]string)
	}

	printersMap := make(map[string]Printer)
	for _, p := range profilerOutput.SPPrintersDataType {
		if p.Name == "" {
			continue
		}

		printersMap[p.URI] = Printer{
			Name:        p.Name,
			Location:    p.Location,
			Model:       p.Model,
			Status:      p.Status,
			URI:         p.URI,
			Driver:      p.PPDName,
			Queue:       queueNames[p.URI],
			IsInstalled: true,
		}
	}

	return printersMap, nil
}

func getQueueNames() (map[string]string, error) {
	cmd := exec.Command("lpstat", "-v")
	output, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to run lpstat: %w", err)
	}

	queueNames := make(map[string]string)
	for _, line := range strings.Split(string(output), "\n") {
		parts := strings.SplitN(line, ": ", 2)
		if len(parts) != 2 {
			continue
		}
		uri := parts[1]
		fields := strings.Fields(parts[0])
		queueName := fields[2]

		if queueName != "" && uri != "" {
			queueNames[uri] = queueName
		}
	}

	return queueNames, nil
}

func (pm *PrinterManager) SetCUPSUser(domain, username string) error {
	userValue := fmt.Sprintf("%s\\\\%s", domain, username)

	args := []string{
		"write",
		"org.cups.PrintingPrefs.plist",
		"User",
		userValue,
	}

	cmd := exec.Command("defaults", args...)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to set CUPS user config: %s, output: %s", err.Error(), string(output))
	}

	return nil
}

func (pm *PrinterManager) InstallPrinter(printer Printer) PrinterInstallResult {
	if printer.IsInstalled {
		return PrinterInstallResult{
			Success: false,
			Message: fmt.Sprintf("Printer '%s' is already installed", printer.Name),
			Error:   "printer_already_exists",
		}
	}

	queueName := sanitizeQueueName(printer.Name)

	uri := printer.URI
	if uri == "" {
		uri = fmt.Sprintf("ipp://%s/ipp/print", queueName)
	}

	args := []string{
		"-p", queueName,
		"-E",
		"-v", uri,
		"-m", "everywhere",
	}

	if printer.Location != "" {
		args = append(args, "-L", printer.Location)
	}

	if printer.Description != "" {
		args = append(args, "-D", printer.Description)
	}

	cmdArgs := append([]string{"lpadmin"}, args...)
	cmd := exec.Command("sudo", cmdArgs...)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return PrinterInstallResult{
			Success: false,
			Message: fmt.Sprintf("Failed to install printer: lpadmin failed: %s", string(output)),
			Error:   err.Error(),
		}
	}

	return PrinterInstallResult{
		Success: true,
		Message: fmt.Sprintf("Printer '%s' installed successfully", printer.Name),
	}
}

func sanitizeQueueName(name string) string {
	name = strings.ToLower(name)

	cyrillicMap := map[string]string{
		"а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
		"ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
		"н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
		"ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch",
		"ы": "y", "э": "e", "ю": "yu", "я": "ya",
	}

	for cyr, lat := range cyrillicMap {
		name = strings.ReplaceAll(name, cyr, lat)
	}

	re := regexp.MustCompile(`[^a-z0-9]`)
	name = re.ReplaceAllString(name, "_")

	re2 := regexp.MustCompile(`_+`)
	name = re2.ReplaceAllString(name, "_")

	name = strings.Trim(name, "_")

	if name == "" {
		name = "printer"
	}

	return name
}

func (pm *PrinterManager) RemovePrinter(printer Printer) PrinterInstallResult {
	cmd := exec.Command("sudo", "lpadmin", "-x", printer.Queue)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return PrinterInstallResult{
			Success: false,
			Message: fmt.Sprintf("Failed to remove printer: %v", err),
			Error:   string(output),
		}
	}

	return PrinterInstallResult{
		Success: true,
		Message: fmt.Sprintf("Printer '%s' removed successfully", printer.Name),
	}
}

func (pm *PrinterManager) GetPrinterJobs(printerName string) ([]map[string]interface{}, error) {
	var jobs []map[string]interface{}

	cmd := exec.Command("lpstat", "-o", printerName)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("failed to get printer jobs: %w", err)
	}

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.Fields(line)
		if len(parts) >= 6 {
			job := map[string]interface{}{
				"id":     parts[0],
				"user":   parts[1],
				"size":   parts[2],
				"pages":  parts[3],
				"status": strings.Join(parts[4:len(parts)-1], " "),
				"time":   parts[len(parts)-1],
			}
			jobs = append(jobs, job)
		}
	}

	return jobs, nil
}

func (pm *PrinterManager) CancelPrinterJob(jobID string) error {
	cmd := exec.Command("cancel", jobID)
	return cmd.Run()
}

func (pm *PrinterManager) CancelAllJobs(printerName string) error {
	cmd := exec.Command("cancel", "-a", printerName)
	return cmd.Run()
}

func (pm *PrinterManager) EnablePrinter(printerName string) error {
	cmd := exec.Command("cupsenable", printerName)
	return cmd.Run()
}

func (pm *PrinterManager) DisablePrinter(printerName string) error {
	cmd := exec.Command("cupsdisable", printerName)
	return cmd.Run()
}

func (pm *PrinterManager) AcceptPrinterJobs(printerName string) error {
	cmd := exec.Command("cupsaccept", printerName)
	return cmd.Run()
}

func (pm *PrinterManager) RejectPrinterJobs(printerName string) error {
	cmd := exec.Command("cupsreject", printerName)
	return cmd.Run()
}

func (pm *PrinterManager) TestPrinter(printerName string) error {
	cmd := exec.Command("lp", "-d", printerName, "/usr/share/cups/data/testprint")
	return cmd.Run()
}
