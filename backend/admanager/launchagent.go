package admanager

import (
	_ "embed"
	"fmt"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"
)

//go:embed templates/com.user.kinit.plist.tmpl
var kinitPlistTemplate string

const kinitLabel = "com.user.kinit"

func installKinitLaunchAgent(keytabPath, principal string) (string, error) {
	u, err := invokingUser()
	if err != nil {
		return "", err
	}
	uid, _ := strconv.Atoi(u.Uid)
	gid, _ := strconv.Atoi(u.Gid)

	destDir := filepath.Join(u.HomeDir, "Library", "LaunchAgents")
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		return "", err
	}
	destPath := filepath.Join(destDir, kinitLabel+".plist")

	rendered := strings.NewReplacer(
		"{{KEYTAB_PATH}}", keytabPath,
		"{{PRINCIPAL}}", principal,
	).Replace(kinitPlistTemplate)

	tmp := destPath + ".tmp"
	if err := os.WriteFile(tmp, []byte(rendered), 0o644); err != nil {
		return "", err
	}
	if os.Getuid() == 0 {
		if err := os.Chown(tmp, uid, gid); err != nil {
			os.Remove(tmp)
			return "", err
		}
	}
	if err := os.Rename(tmp, destPath); err != nil {
		return "", err
	}

	_ = exec.Command("launchctl", "bootout", fmt.Sprintf("gui/%d", uid), kinitLabel).Run()

	out, err := exec.Command(
		"launchctl", "bootstrap",
		fmt.Sprintf("gui/%d", uid), destPath,
	).CombinedOutput()
	if err != nil {
		if out2, err2 := exec.Command(
			"launchctl", "bootstrap",
			fmt.Sprintf("user/%d", uid), destPath,
		).CombinedOutput(); err2 != nil {
			return destPath, fmt.Errorf(
				"launchctl bootstrap failed (gui: %v %s / user: %v %s)",
				err, strings.TrimSpace(string(out)),
				err2, strings.TrimSpace(string(out2)),
			)
		}
	}
	return destPath, nil
}
func invokingUser() (*user.User, error) {
	if sudoUser := os.Getenv("SUDO_USER"); sudoUser != "" && os.Getuid() == 0 {
		return user.Lookup(sudoUser)
	}
	return user.Current()
}
