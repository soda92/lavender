package main

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"
)

// viteSupervisor owns the `pnpm dev` (Vite) child started in -dev mode so a
// wedged HMR / module cache can be restarted via POST /api/dev/restart-vite
// without relaunching the whole stack.
type viteSupervisor struct {
	mu          sync.Mutex
	cmd         *exec.Cmd
	backendPort int
}

func newViteSupervisor(backendPort int) *viteSupervisor {
	return &viteSupervisor{backendPort: backendPort}
}

func (v *viteSupervisor) startLocked() error {
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/c", "pnpm", "dev")
	} else {
		cmd = exec.Command("pnpm", "dev")
	}
	cmd.Dir = "./web-app"
	cmd.Env = append(os.Environ(), fmt.Sprintf("BACKEND_PORT=%d", v.backendPort))
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	configureViteProc(cmd)
	if err := cmd.Start(); err != nil {
		return err
	}
	v.cmd = cmd
	go func() { _ = cmd.Wait() }()
	return nil
}

// Start launches Vite once (called at server boot).
func (v *viteSupervisor) Start() error {
	v.mu.Lock()
	defer v.mu.Unlock()
	return v.startLocked()
}

// Restart kills the whole Vite process group and launches a fresh one,
// returning the new pnpm PID.
func (v *viteSupervisor) Restart() (int, error) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.cmd != nil && v.cmd.Process != nil {
		killViteGroup(v.cmd)
		v.cmd = nil
	}
	if err := v.startLocked(); err != nil {
		return 0, err
	}
	return v.cmd.Process.Pid, nil
}

// Stop terminates Vite during server shutdown.
func (v *viteSupervisor) Stop() {
	v.mu.Lock()
	defer v.mu.Unlock()
	if v.cmd != nil && v.cmd.Process != nil {
		killViteGroup(v.cmd)
		v.cmd = nil
	}
}

// waitForViteReady polls the Vite origin until it accepts TCP (or timeout).
func waitForViteReady(origin string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", strings.TrimPrefix(origin, "http://"), 300*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			return true
		}
		time.Sleep(150 * time.Millisecond)
	}
	return false
}
