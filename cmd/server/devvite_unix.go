//go:build !windows

package main

import (
	"os/exec"
	"syscall"
	"time"
)

// configureViteProc puts pnpm (and its Vite child) in a dedicated process
// group so the whole tree can be signalled via -pid.
func configureViteProc(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// killViteGroup terminates the process group, escalating SIGTERM -> SIGKILL.
func killViteGroup(cmd *exec.Cmd) {
	pid := cmd.Process.Pid
	_ = syscall.Kill(-pid, syscall.SIGTERM)
	done := make(chan struct{})
	go func() { _, _ = cmd.Process.Wait(); close(done) }()
	select {
	case <-done:
		return
	case <-time.After(800 * time.Millisecond):
	}
	_ = syscall.Kill(-pid, syscall.SIGKILL)
	<-done
}
