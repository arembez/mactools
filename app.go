package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"mactools/backend/admanager"
	"mactools/backend/printers"
	"os/exec"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed wails.json
var configFile []byte

var cachedVersion string

type App struct {
	ctx            context.Context
	adMgr          *admanager.ADManager
	printerManager *printers.PrinterManager
}

func NewApp() *App {
	return &App{
		adMgr:          admanager.NewADManager(),
		printerManager: printers.NewPrinterManager(),
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) Version() string {
	if cachedVersion != "" {
		return cachedVersion
	}

	var config struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}

	if err := json.Unmarshal(configFile, &config); err != nil {
		return "unknown"
	}

	cachedVersion = config.Info.ProductVersion
	return cachedVersion
}

func (a *App) RestartComputer() error {
	cmd := exec.Command("osascript", "-e", "tell app \"System Events\" to restart")
	return cmd.Run()
}

func (a *App) ExtendSudoSession(password string) bool {
	cmd := exec.Command("sudo", "-S", "-v")
	cmd.Stdin = strings.NewReader(password + "\n")

	if err := cmd.Run(); err != nil {
		return false
	}
	return true
}

func (a *App) CreateKeytab(principal, password, enctype string) admanager.JoinDomainResult {
	var result admanager.JoinDomainResult
	result = a.adMgr.CreateKeytab(principal, password, enctype)
	return result
}

func (a *App) GetCurrentHostname() string {
	return a.adMgr.GetCurrentHostname()
}

func (a *App) GetLocalHostname() string {
	return a.adMgr.GetLocalHostname()
}

func (a *App) GetHostname() string {
	return a.adMgr.GetHostname()
}

func (a *App) SetHostname(newName string) string {
	return a.adMgr.SetHostname(newName)
}

func (a *App) SetFullHostname(computerName, localName, hostName string) string {
	return a.adMgr.SetFullHostname(computerName, localName, hostName)
}

func (a *App) GetDesiredHostname() (string, error) {
	return a.adMgr.GetDesiredHostname()
}

func (a *App) GetDomainStatus() map[string]interface{} {
	return a.adMgr.GetDomainStatus()
}

func (a *App) JoinDomain(config map[string]interface{}) admanager.JoinDomainResult {
	return a.adMgr.JoinDomain(config)
}

func (a *App) LeaveDomain(username, password string) admanager.JoinDomainResult {
	return a.adMgr.LeaveDomain(username, password)
}

func (a *App) TestADConnectivity(domain string) map[string]interface{} {
	return a.adMgr.TestADConnectivity(domain)
}

func (a *App) ChangeComputerName(newName, username, password string) admanager.JoinDomainResult {
	return a.adMgr.ChangeComputerName(newName, username, password)
}

func (a *App) SaveConfig(config map[string]interface{}) admanager.JoinDomainResult {
	return a.adMgr.SaveConfig(config)
}

func (a *App) LoadConfig() map[string]interface{} {
	return a.adMgr.LoadConfig()
}

func (a *App) CheckAdminRights() bool {
	return a.adMgr.CheckAdminRights()
}

func (a *App) VerifyAdminPassword(password string) bool {
	return a.adMgr.VerifyAdminPassword(password)
}

func (a *App) GetSystemInfo() map[string]interface{} {
	return a.adMgr.GetSystemInfo()
}

func (a *App) ExecuteCommand(command string, args []string) map[string]interface{} {
	return a.adMgr.ExecuteCommand(command, args)
}

func (a *App) RestartService(serviceName string) admanager.JoinDomainResult {
	return a.adMgr.RestartService(serviceName)
}

func (a *App) RebootSystem() admanager.JoinDomainResult {
	return a.adMgr.RebootSystem()
}

func (a *App) OpenFileDialog() string {
	result, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select File",
	})
	if err != nil {
		return ""
	}
	return result
}

func (a *App) MountShare(shareType string) map[string]interface{} {
	result := make(map[string]interface{})

	err := admanager.MountShare(shareType)
	if err != nil {
		result["success"] = false
		result["error"] = err.Error()
		return result
	}

	result["success"] = true
	return result
}

func (a *App) UnmountShare(shareType string) map[string]interface{} {
	result := make(map[string]interface{})

	err := admanager.UnmountShare(shareType)
	if err != nil {
		result["success"] = false
		result["error"] = err.Error()
		return result
	}

	result["success"] = true
	return result
}

func (a *App) GetMountStatus() map[string]interface{} {
	result := make(map[string]interface{})

	err := admanager.UpdateMountPoints()
	mountPoints := admanager.GetMountPoints()

	if err != nil {
		result["success"] = false
		result["error"] = err.Error()
		return result
	}

	result["success"] = true
	for shareType, mountPoint := range mountPoints {
		result[shareType] = map[string]interface{}{
			"mounted":    mountPoint.Mounted,
			"mountPoint": mountPoint.MountPath,
			"error":      mountPoint.MountError,
		}
	}
	return result
}

func (a *App) IsAutoSMBConfigured() map[string]interface{} {
	result := make(map[string]interface{})

	configured, err := admanager.IsAutoSMBConfigured()
	if err != nil {
		result["success"] = false
		result["error"] = err.Error()
		return result
	}

	result["success"] = true
	result["configured"] = configured

	return result
}

func (a *App) GetPrinters() ([]printers.Printer, error) {
	return a.printerManager.GetPrinters()
}

func (a *App) InstallPrinter(printer printers.Printer) printers.PrinterInstallResult {
	return a.printerManager.InstallPrinter(printer)
}

func (a *App) RemovePrinter(printer printers.Printer) printers.PrinterInstallResult {
	return a.printerManager.RemovePrinter(printer)
}

func (a *App) GetPrinterJobs(printerName string) ([]map[string]interface{}, error) {
	return a.printerManager.GetPrinterJobs(printerName)
}

func (a *App) CancelPrinterJob(jobID string) error {
	return a.printerManager.CancelPrinterJob(jobID)
}

func (a *App) CancelAllPrinterJobs(printerName string) error {
	return a.printerManager.CancelAllJobs(printerName)
}

func (a *App) EnablePrinter(printerName string) error {
	return a.printerManager.EnablePrinter(printerName)
}

func (a *App) DisablePrinter(printerName string) error {
	return a.printerManager.DisablePrinter(printerName)
}

func (a *App) AcceptPrinterJobs(printerName string) error {
	return a.printerManager.AcceptPrinterJobs(printerName)
}

func (a *App) RejectPrinterJobs(printerName string) error {
	return a.printerManager.RejectPrinterJobs(printerName)
}

func (a *App) TestPrinter(printerName string) error {
	return a.printerManager.TestPrinter(printerName)
}

func (a *App) SetCUPSURL(url string) {
	a.printerManager.SetCUPSURL(url)
}

func (a *App) SetCUPSUser(domain, username string) {
	a.printerManager.SetCUPSUser(domain, username)
}
