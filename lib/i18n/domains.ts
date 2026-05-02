export const domainsCopy = {
  en: {
    // Page Header
    merchantTitle: "Domain Rotation Pool",
    merchantDesc: "Manage your shield domains and verify popup bridge readiness before assigning them to stores.",
    merchantEyebrow: "MERCHANT / SHIELD DOMAINS",
    superAdminTitle: "Domain Rotation Pool",
    superAdminDesc: "Manage shared and tenant-specific shield domains, then verify DNS directly against Vercel.",
    superAdminEyebrow: "SHIELD DOMAINS",
    superAdminBadge: "SUPER ADMIN",
    shieldGuide: "Shield Guide",
    addDomain: "Add Domain",

    // Super Admin Info Card
    saDomainControl: "Super Admin Domain Control",
    saDomainControlDesc: "Manage shield domains across tenants, shared pools, store assignments, DNS verification, and routing ownership.",

    // Vercel Integration Info
    vercelConnected: "Vercel Project Connected",
    vercelRequired: "Vercel API Integration Required",
    vercelConnectedDesc: (projectRef: string, teamContext: string | null) => `Domains sync against project ${projectRef}${teamContext ? ` (${teamContext})` : ""}.`,
    vercelRequiredDesc: "Set VERCEL_API_TOKEN and VERCEL_PROJECT_ID in Vercel project settings, then restart the app to enable live add, sync, and DNS verification.",
    popupBridgeTarget: "Popup bridge target:",

    // Onboarding Checklist
    onboardingTitle: "Onboarding Checklist",
    onboardingDescAdmin: "Use this sequence to add, verify, and hand off shield domains safely.",
    onboardingDescMerchant: "Follow this flow to bring a domain live without leaving the dashboard.",
    step1Label: "Connect Vercel project",
    step1Done: (projectRef: string) => `Project ${projectRef} is linked for live domain onboarding.`,
    step1Pending: "Add VERCEL_API_TOKEN and VERCEL_PROJECT_ID, then restart the app.",
    step2Label: "Add a shield domain",
    step2Done: (count: number) => `${count} domain${count !== 1 ? "s" : ""} currently in the rotation pool.`,
    step2Pending: "Use Add Domain to insert the hostname into your shield pool.",
    step3Label: "Point DNS to Vercel",
    step3Done: "Use Sync / Verify DNS to confirm the recommended Vercel record is in place.",
    step3Pending: "After adding the domain, configure the DNS record Vercel returns.",
    step4Label: "Verify popup bridge",
    step4Done: "At least one domain reaches DNS Ready but its /checkout/popup health check is failing.",
    step4Pending: "When DNS turns Ready, the dashboard auto-checks /checkout/popup health.",
    step5Label: "Assign to store",
    step5DoneAdmin: "Map each ready domain to the right tenant store from the Domains table.",
    step5DoneMerchant: "Link the domain to the store that should expose the matching shield facade.",

    // Summary Cards
    totalDomains: "Total Domains",
    activeCount: "Active",
    bridgeReady: "Bridge Ready",
    needsAction: "Needs Action",

    // Search and Filters
    searchPlaceholder: "Search domains...",
    filterAll: "All",
    filterActive: "Active",
    filterInactive: "Inactive",
    filterShared: "Shared Pool",
    filterTenant: "Tenant Domains",
    filterVerified: "Verified",
    filterPending: "Pending",
    filterFailed: "Failed",
    domainsCount: (count: number) => `${count} domain${count !== 1 ? "s" : ""}`,

    // Table Headers
    thDomain: "Domain",
    thStatus: "Status",
    thVercel: "Vercel",
    thDns: "DNS",
    thBridge: "Bridge",
    thAssignedTo: "Assigned To",
    thAdded: "Added",
    thActions: "Actions",

    // Table Empty States
    noDomainsYet: "No domains yet. Add and verify a domain before creating a complete Payment Identity.",
    noDomainsMatch: "No domains match your search.",

    // Table Content
    popupBridge: "Popup bridge:",
    active: "Active",
    inactive: "Inactive",
    checked: "Checked",
    configuredBy: "Configured by",
    healthy: "Healthy",
    failed: "Failed",
    pending: "Pending",
    popupChecked: "Popup checked",
    http: "HTTP",
    bridgeHealthAuto: "Bridge health runs automatically once DNS is ready.",
    sharedPool: "Shared Pool",
    noStoreLinked: "No store linked",
    moreStores: (count: number) => `+${count} more`,
    readOnly: "Read only",

    // Action Tooltips
    assignToStore: "Assign to store",
    syncWithVercel: "Sync with Vercel",
    verifyDns: "Verify DNS",
    activate: "Activate",
    deactivate: "Deactivate",
    deleteDomain: "Delete domain",

    // Add Domain Modal
    addDomainTitle: "Add Shield Domain",
    addDomainDesc: "The domain will be added to your rotation pool and synced to Vercel when integration is configured.",
    domainLabel: "Domain",
    tenantAssignment: "Tenant Assignment",
    tenantAssignmentDesc: "Super Admins can assign this domain to a tenant or keep it in the shared pool.",
    sharedPoolAll: "Shared Pool (all tenants)",
    merchantAutoAssigned: "Domains added here are automatically assigned to your merchant tenant.",
    cancel: "Cancel",
    domainRequired: "Domain is required.",
    invalidDomain: "Invalid domain format.",

    // Delete Modal
    deleteDomainTitle: "Delete Shield Domain",
    deleteDomainDesc1: "Remove",
    deleteDomainDesc2: "from the rotation pool? This cannot be undone.",
    deleteDomainBtn: "Delete",

    // Assign Store Modal
    assignStoreTitle: "Assign Domain to Store",
    assignStoreDesc1: "Link",
    assignStoreDesc2: "to one or more stores so storefront settings stay aligned with the shield facade.",
    currentAssignments: "Current Assignments",
    noStoresLinkedYet: "No stores linked yet.",
    unassign: "Unassign",
    addStore: "Add Store",
    selectStore: "Select a store",
    assign: "Assign",

    // Alerts
    errAddDomain: "Failed to add domain.",
    errNetwork: "Network error.",
    errUpdateDomain: "Failed to update domain.",
    errSyncDomain: "Failed to sync domain with Vercel.",
    errVerifyDns: "Failed to verify DNS.",
    errAssignStore: "Failed to assign store.",
    errUnassignStore: "Failed to unassign store.",
    errDeleteDomain: "Failed to delete domain.",

    // Time Ago
    justNow: "just now",
    mAgo: "m ago",
    hAgo: "h ago",
    dAgo: "d ago",
    never: "Never",

    // Vercel Status Mapping
    vReady: "Ready",
    vVerificationRequired: "Verification Required",
    vNeedsDns: "Needs DNS",
    vIntegrationOff: "Integration Off",
    vError: "Error",
    vLinked: "Linked",
    vNotLinked: "Not Linked"
  },
  vi: {
    // Page Header
    merchantTitle: "Luân chuyển tên miền",
    merchantDesc: "Quản lý tên miền bảo vệ của bạn và kiểm tra tình trạng cầu nối popup trước khi gán cho cửa hàng.",
    merchantEyebrow: "MERCHANT / TÊN MIỀN",
    superAdminTitle: "Luân chuyển tên miền",
    superAdminDesc: "Quản lý tên miền dùng chung và tên miền riêng của tenant, đồng thời xác minh DNS trực tiếp với Vercel.",
    superAdminEyebrow: "TÊN MIỀN BẢO VỆ",
    superAdminBadge: "SUPER ADMIN",
    shieldGuide: "Hướng dẫn Shield",
    addDomain: "Thêm tên miền",

    // Super Admin Info Card
    saDomainControl: "Quản lý tên miền Super Admin",
    saDomainControlDesc: "Quản lý tên miền bảo vệ giữa các tenant, nhóm dùng chung, gán cửa hàng, xác minh DNS, và quyền sở hữu định tuyến.",

    // Vercel Integration Info
    vercelConnected: "Đã kết nối dự án Vercel",
    vercelRequired: "Cần tích hợp Vercel API",
    vercelConnectedDesc: (projectRef: string, teamContext: string | null) => `Tên miền đồng bộ với dự án ${projectRef}${teamContext ? ` (${teamContext})` : ""}.`,
    vercelRequiredDesc: "Cấu hình VERCEL_API_TOKEN và VERCEL_PROJECT_ID trong cài đặt dự án Vercel, sau đó khởi động lại ứng dụng để thêm, đồng bộ, và xác minh DNS trực tiếp.",
    popupBridgeTarget: "Host đích của Popup bridge:",

    // Onboarding Checklist
    onboardingTitle: "Kiểm tra cấu hình",
    onboardingDescAdmin: "Sử dụng quy trình này để thêm, xác minh, và bàn giao tên miền bảo vệ an toàn.",
    onboardingDescMerchant: "Thực hiện theo quy trình này để kích hoạt tên miền mà không cần rời khỏi dashboard.",
    step1Label: "Kết nối dự án Vercel",
    step1Done: (projectRef: string) => `Dự án ${projectRef} đã được liên kết để thiết lập tên miền trực tiếp.`,
    step1Pending: "Thêm VERCEL_API_TOKEN và VERCEL_PROJECT_ID, sau đó khởi động lại.",
    step2Label: "Thêm tên miền bảo vệ",
    step2Done: (count: number) => `Đang có ${count} tên miền trong nhóm luân chuyển.`,
    step2Pending: "Sử dụng chức năng Thêm tên miền để đưa hostname vào nhóm bảo vệ của bạn.",
    step3Label: "Trỏ DNS tới Vercel",
    step3Done: "Sử dụng chức năng Đồng bộ / Xác minh DNS để kiểm tra bản ghi Vercel đã chính xác.",
    step3Pending: "Sau khi thêm tên miền, hãy cấu hình bản ghi DNS mà Vercel yêu cầu.",
    step4Label: "Xác minh cầu nối popup",
    step4Done: "Ít nhất một tên miền đã có DNS Sẵn sàng nhưng kiểm tra /checkout/popup đang thất bại.",
    step4Pending: "Khi DNS chuyển sang Sẵn sàng, dashboard sẽ tự động kiểm tra tình trạng /checkout/popup.",
    step5Label: "Gán vào cửa hàng",
    step5DoneAdmin: "Gán từng tên miền đã sẵn sàng cho cửa hàng của tenant phù hợp từ bảng Tên miền.",
    step5DoneMerchant: "Liên kết tên miền với cửa hàng mà bạn muốn sử dụng làm vỏ bọc bảo vệ.",

    // Summary Cards
    totalDomains: "Tổng Tên Miền",
    activeCount: "Đang hoạt động",
    bridgeReady: "Bridge Sẵn sàng",
    needsAction: "Cần xử lý",

    // Search and Filters
    searchPlaceholder: "Tìm tên miền...",
    filterAll: "Tất cả",
    filterActive: "Đang hoạt động",
    filterInactive: "Không hoạt động",
    filterShared: "Nhóm dùng chung",
    filterTenant: "Tên miền Tenant",
    filterVerified: "Đã xác minh",
    filterPending: "Đang chờ",
    filterFailed: "Thất bại",
    domainsCount: (count: number) => `${count} tên miền`,

    // Table Headers
    thDomain: "Tên miền",
    thStatus: "Trạng thái",
    thVercel: "Vercel",
    thDns: "DNS",
    thBridge: "Cầu nối (Bridge)",
    thAssignedTo: "Đã gán cho",
    thAdded: "Ngày thêm",
    thActions: "Thao tác",

    // Table Empty States
    noDomainsYet: "Chưa có tên miền nào. Thêm và xác minh một tên miền trước khi tạo Payment Identity hoàn chỉnh.",
    noDomainsMatch: "Không tìm thấy tên miền phù hợp.",

    // Table Content
    popupBridge: "Popup bridge:",
    active: "Đang hoạt động",
    inactive: "Không hoạt động",
    checked: "Đã kiểm tra",
    configuredBy: "Được cấu hình bởi",
    healthy: "Hoạt động tốt",
    failed: "Thất bại",
    pending: "Đang chờ",
    popupChecked: "Đã kiểm tra Popup",
    http: "HTTP",
    bridgeHealthAuto: "Tình trạng bridge sẽ tự kiểm tra khi DNS sẵn sàng.",
    sharedPool: "Nhóm dùng chung",
    noStoreLinked: "Chưa liên kết cửa hàng",
    moreStores: (count: number) => `+${count} cửa hàng khác`,
    readOnly: "Chỉ xem",

    // Action Tooltips
    assignToStore: "Gán vào cửa hàng",
    syncWithVercel: "Đồng bộ với Vercel",
    verifyDns: "Xác minh DNS",
    activate: "Bật",
    deactivate: "Tắt",
    deleteDomain: "Xóa tên miền",

    // Add Domain Modal
    addDomainTitle: "Thêm tên miền",
    addDomainDesc: "Tên miền sẽ được thêm vào nhóm luân chuyển và đồng bộ lên Vercel khi đã kết nối tích hợp.",
    domainLabel: "Tên miền",
    tenantAssignment: "Gán Tenant",
    tenantAssignmentDesc: "Super Admin có thể gán tên miền này cho một tenant hoặc giữ lại ở nhóm dùng chung.",
    sharedPoolAll: "Nhóm dùng chung (tất cả tenant)",
    merchantAutoAssigned: "Tên miền được thêm ở đây sẽ tự động gán cho tenant merchant của bạn.",
    cancel: "Hủy",
    domainRequired: "Vui lòng nhập tên miền.",
    invalidDomain: "Định dạng tên miền không hợp lệ.",

    // Delete Modal
    deleteDomainTitle: "Xóa tên miền",
    deleteDomainDesc1: "Bạn có chắc chắn muốn gỡ bỏ",
    deleteDomainDesc2: "khỏi nhóm luân chuyển? Hành động này không thể hoàn tác.",
    deleteDomainBtn: "Xóa",

    // Assign Store Modal
    assignStoreTitle: "Gán tên miền vào cửa hàng",
    assignStoreDesc1: "Liên kết",
    assignStoreDesc2: "với một hoặc nhiều cửa hàng để cấu hình storefront được đồng bộ hóa với vỏ bọc bảo vệ.",
    currentAssignments: "Đang gán hiện tại",
    noStoresLinkedYet: "Chưa có cửa hàng nào được liên kết.",
    unassign: "Gỡ bỏ",
    addStore: "Thêm cửa hàng",
    selectStore: "Chọn cửa hàng",
    assign: "Gán",

    // Alerts
    errAddDomain: "Lỗi thêm tên miền.",
    errNetwork: "Lỗi kết nối.",
    errUpdateDomain: "Lỗi cập nhật tên miền.",
    errSyncDomain: "Lỗi đồng bộ tên miền với Vercel.",
    errVerifyDns: "Lỗi xác minh DNS.",
    errAssignStore: "Lỗi gán cửa hàng.",
    errUnassignStore: "Lỗi gỡ cửa hàng.",
    errDeleteDomain: "Lỗi xóa tên miền.",

    // Time Ago
    justNow: "vừa xong",
    mAgo: "phút trước",
    hAgo: "giờ trước",
    dAgo: "ngày trước",
    never: "Chưa từng",

    // Vercel Status Mapping
    vReady: "Sẵn sàng",
    vVerificationRequired: "Cần xác minh",
    vNeedsDns: "Cần cấu hình DNS",
    vIntegrationOff: "Chưa tích hợp",
    vError: "Lỗi",
    vLinked: "Đã liên kết",
    vNotLinked: "Chưa liên kết"
  }
}
