package admanager

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
)

var mountPoints = map[string]MountPoint{
	"personal": {
		DisplayName: "Личная",
		Template:    "{mountPath} -fstype=smbfs,soft,nobrowse,noowners ://blotus.ru/fs/%D0%9B%D0%B8%D1%87%D0%BD%D0%B0%D1%8F/{username}",
	},
	"common": {
		DisplayName: "Подразделения",
		Template:    "{mountPath} -fstype=smbfs,soft,nobrowse,noowners ://blotus.ru/fs/%D0%9F%D0%BE%D0%B4%D1%80%D0%B0%D0%B7%D0%B4%D0%B5%D0%BB%D0%B5%D0%BD%D0%B8%D1%8F/",
	},
	"department": {
		DisplayName: "Отдел",
		Template:    "{mountPath} -fstype=smbfs,soft,nobrowse,noowners ://blotus.ru/fs/%D0%9E%D1%82%D0%B4%D0%B5%D0%BB/{username}",
	},
}

var autoMasterPath = "/etc/auto_master"

func GetMountPoints() map[string]MountPoint {
	return mountPoints
}

func MountShare(shareType string) error {
	mountPoint, ok := mountPoints[shareType]
	if !ok {
		return fmt.Errorf("failed to get mount point: %s", shareType)
	}

	if err := addToAutoMaster(autoMasterPath, mountPoint.MountFile); err != nil {
		return fmt.Errorf("failed to update auto_master: %v", err)
	}

	if err := createMountFile(mountPoint.MountFile, mountPoint.MountString); err != nil {
		return fmt.Errorf("failed to create auto_smb: %v", err)
	}

	if err := createMountPoint(mountPoint.MountPath); err != nil {
		return fmt.Errorf("failed to create mount points: %v", err)
	}

	if err := restartAutofs(); err != nil {
		_ = err
	}

	return nil
}

func UnmountShare(shareType string) error {
	mountPoint, ok := mountPoints[shareType]
	if !ok {
		return fmt.Errorf("failed to get mount point: %s", shareType)
	}

	if err := removeFromAutoMaster(autoMasterPath, mountPoint.MountFile); err != nil {
		return fmt.Errorf("failed to remove from auto_master: %v", err)
	}

	if err := os.Remove(mountPoint.MountFile); err != nil {
		if !os.IsNotExist(err) {
			fmt.Printf("Warning: failed to remove mount file %s: %v\n", mountPoint.MountFile, err)
		}
	} else {
		fmt.Printf("Removed mount file: %s\n", mountPoint.MountFile)
	}

	cmd := exec.Command("sudo", "umount", mountPoint.MountPath)
	if err := cmd.Run(); err != nil {
		fmt.Printf("Warning: failed to unmount %s: %v\n", mountPoint.MountPath, err)
	} else {
		fmt.Printf("Unmounted: %s\n", mountPoint.MountPath)
	}

	if err := os.RemoveAll(mountPoint.MountPath); err != nil {
		fmt.Printf("Warning: failed to remove mount point %s: %v\n", mountPoint.MountPath, err)
	} else {
		fmt.Printf("Removed mount point: %s\n", mountPoint.MountPath)
	}

	if err := restartAutofs(); err != nil {
		fmt.Printf("Warning: failed to restart autofs: %v\n", err)
	}

	return nil
}

func removeFromAutoMaster(autoMasterPath, mountFile string) error {
	content, err := os.ReadFile(autoMasterPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("failed to read auto_master: %v", err)
	}

	lines := strings.Split(string(content), "\n")
	var newLines []string
	found := false

	for _, line := range lines {
		if strings.Contains(line, mountFile) {
			found = true
			fmt.Printf("Removing line from auto_master: %s\n", line)
			continue
		}
		newLines = append(newLines, line)
	}

	if !found {
		fmt.Printf("No entry found in auto_master for %s\n", mountFile)
		return nil
	}

	newContent := strings.TrimRight(strings.Join(newLines, "\n"), "\n")
	if newContent != "" {
		newContent += "\n"
	}

	cmd := exec.Command("sudo", "tee", autoMasterPath)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}

	go func() {
		defer stdin.Close()
		stdin.Write([]byte(newContent))
	}()

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to update auto_master: %v", err)
	}

	fmt.Printf("Updated %s\n", autoMasterPath)
	return nil
}

func UpdateMountPoints() error {
	currentUser, err := user.Current()
	if err != nil {
		return fmt.Errorf("failed to get current user: %v", err)
	}
	username := currentUser.Username

	for shareType, mountPoint := range mountPoints {
		mountPath := fmt.Sprintf("/Users/%s/%s", username, mountPoint.DisplayName)
		mountFile := fmt.Sprintf("/opt/smbshares/%s", mountPoint.DisplayName)
		mountString := strings.NewReplacer(
			"{mountPath}", mountPath,
			"{username}", username,
		).Replace(mountPoint.Template)
		mounted, mountError := checkMountStatus(mountPath)

		mountPoints[shareType] = MountPoint{
			DisplayName: mountPoint.DisplayName,
			Template:    mountPoint.Template,
			MountPath:   mountPath,
			MountFile:   mountFile,
			MountString: mountString,
			Mounted:     mounted,
			MountError:  mountError,
		}
	}
	return nil
}

func checkMountStatus(mountPath string) (bool, error) {
	if _, err := os.Stat(mountPath); os.IsNotExist(err) {
		return false, fmt.Errorf("mount point does not exist")
	}

	cmd := exec.Command("mount")
	output, err := cmd.Output()
	if err != nil {
		return false, fmt.Errorf("failed to get mount info: %v", err)
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.Contains(line, mountPath) && strings.Contains(line, "smbfs") {
			if checkReadAccess(mountPath) {
				return true, nil
			}
			return false, nil
		}
	}

	cmd = exec.Command("df", "-t", "smbfs")
	output, err = cmd.Output()
	if err == nil {
		lines := strings.Split(string(output), "\n")
		for _, line := range lines {
			if strings.Contains(line, mountPath) {
				if checkReadAccess(mountPath) {
					return true, nil
				}
				return false, nil
			}
		}
	}

	return false, nil
}

func checkReadAccess(path string) bool {
	entries, err := os.ReadDir(path)
	if err != nil {
		return false
	}

	for _, entry := range entries {
		if entry.IsDir() {
			subPath := filepath.Join(path, entry.Name())
			subEntries, err := os.ReadDir(subPath)
			if err != nil {
				continue
			}
			if len(subEntries) > 0 {
				return true
			}
		}
	}

	return len(entries) > 0
}

func isEmptyDirectory(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return true
	}
	defer f.Close()

	_, err = f.Readdirnames(1)
	return err != nil
}

func IsAutoSMBConfigured() (bool, error) {
	autoMasterPath := "/etc/auto_master"
	masterContent, err := os.ReadFile(autoMasterPath)
	if err != nil {
		return false, fmt.Errorf("failed to read auto_master: %v", err)
	}

	if !strings.Contains(string(masterContent), "/- /etc/auto_smb") {
		return false, nil
	}

	if _, err := os.Stat("/etc/auto_smb"); os.IsNotExist(err) {
		return false, nil
	}

	return true, nil
}

func addToAutoMaster(path, file string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("auto_master not found")
		}
		return err
	}

	line := fmt.Sprintf("/- %s", file)
	if containsLine(string(content), line) {
		return nil
	}

	cmd := exec.Command("sudo", "tee", "-a", path)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}

	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	go func() {
		defer stdin.Close()
		stdin.Write([]byte(line + "\n"))
	}()

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to append to auto_master: %v, stderr: %s", err, stderr.String())
	}

	return nil
}

func createMountFile(path, mountString string) error {
	dir := filepath.Dir(path)
	cmd := exec.Command("sudo", "mkdir", "-p", dir)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to create directory %s: %v", dir, err)
	}

	cmd = exec.Command("sudo", "tee", path)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return err
	}

	go func() {
		defer stdin.Close()
		stdin.Write([]byte(mountString))
	}()

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to write to %s: %v", path, err)
	}

	return nil
}

func createMountPoint(mountPath string) error {
	if err := os.MkdirAll(mountPath, 0700); err != nil {
		return fmt.Errorf("failed to create %s: %v", mountPath, err)
	}
	return nil
}

func restartAutofs() error {
	cmd := exec.Command("sudo", "automount", "-vc")
	if err := cmd.Run(); err != nil {
		cmd = exec.Command("sudo", "launchctl", "unload", "/System/Library/LaunchDaemons/com.apple.autofs.plist")
		_ = cmd.Run()

		cmd = exec.Command("sudo", "launchctl", "load", "/System/Library/LaunchDaemons/com.apple.autofs.plist")
		return cmd.Run()
	}
	return nil
}

func createFinderAlias(mountPoint, mountAlias, alias string) error {
	script := fmt.Sprintf(`tell application "Finder"
	try
		if exists (POSIX file "%s") then
			delete (POSIX file "%s")
		end if
		
		make new alias file at (POSIX file "%s") to (POSIX file "%s") with properties {name:"%s"}
	end try
end tell`, mountAlias, mountAlias, mountAlias, mountPoint, alias)

	tmpFile := filepath.Join(os.TempDir(), "create_aliases.scpt")
	if err := os.WriteFile(tmpFile, []byte(script), 0644); err != nil {
		return err
	}
	defer os.Remove(tmpFile)

	cmd := exec.Command("osascript", tmpFile)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to create Finder aliases: %v", err)
	}

	return nil
}

func containsLine(content, line string) bool {
	lines := strings.Split(content, "\n")
	for _, l := range lines {
		if strings.TrimSpace(l) == line {
			return true
		}
	}
	return false
}
