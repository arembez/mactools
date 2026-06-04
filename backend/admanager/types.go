package admanager

type JoinDomainResult struct {
	Success bool              `json:"success"`
	Message string            `json:"message"`
	Error   string            `json:"error,omitempty"`
	Details map[string]string `json:"details,omitempty"`
}

type DomainConfig struct {
	Domain          string `json:"domain"`
	Username        string `json:"username"`
	Password        string `json:"password"`
	ComputerName    string `json:"computerName"`
	OU              string `json:"ou"`
	MobileAccount   bool   `json:"mobileAccount"`
	MobileConfirm   bool   `json:"mobileConfirm"`
	UseUNCPath      bool   `json:"useUNCPath"`
	AdminGroups     string `json:"adminGroups"`
	PacketSign      string `json:"packetSign"`
	PacketEncrypt   string `json:"packetEncrypt"`
	Namespace       string `json:"namespace"`
	PreferredServer string `json:"preferredServer"`
}

type MountPoint struct {
	DisplayName string
	Template    string
	MountPath   string
	MountFile   string
	MountString string
	Mounted     bool
	MountError  error
}
