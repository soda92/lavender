//go:build windows

package main

import (
	"os/exec"
	"strconv"
)

// configureViteProc is a no-op on Windows.
func configureViteProc(cmd *exec.Cmd) {}

// killViteGroup force-kills pnpm and all children (/T tree, /F force).
func killViteGroup(cmd *exec.Cmd) {
	_ = exec.Command("taskkill", "/T", "/F", "/PID", strconv.Itoa(cmd.Process.Pid)).Run()
	_, _ = cmd.Process.Wait()
}
