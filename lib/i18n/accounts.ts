export const accountsCopy = {
  en: {
    title: "Merchant Accounts",
    description: "Manage payment provider accounts, routing status, limits, profile mapping, and operational health.",
    eyebrow: "ACCOUNTS",
    
    // Summary card
    totalVolumeToday: "Total Volume Today",
    activeAccounts: "active accounts",

    // Tabs / Filters
    filterAll: "All",
    filterActive: "Active",
    filterLimited: "Limited",
    filterWarmUp: "Warm-up",
    filterPaused: "Paused",
    filterSuspended: "Suspended",

    // Action buttons
    sync: "Sync",
    syncing: "Syncing...",
    addAccount: "Add Account",
    editAccount: "Edit Account",

    // Table Headers
    thAccountName: "Account Name",
    thShieldDomain: "Shield Domain",
    thStatus: "Status",
    thDisplayProfile: "Display Profile",
    thDailyVolume: "Daily Volume",
    thPriority: "Priority",
    thTx: "Tx",
    
    // Empty state
    noAccountsFound: "No accounts found",
    noAccountsDesc: "There are no accounts matching the selected filter status.",

    // Drawer / Modal common
    btnCancel: "Cancel",
    btnSave: "Save Changes",
    btnSaving: "Saving...",
    btnSaved: "Saved",
    btnAdd: "Add Account",
    btnAdding: "Adding...",
    btnAdded: "Added",

    // Add Merchant Modal
    addModalTitle: "Add Merchant Account",
    addModalDesc: "Connect a payment provider account and configure routing.",

    // Edit Slide Over
    editing: "Editing",

    // Tabs
    tabInfo: "Account Info",
    tabOverview: "Overview",
    tabCredentials: "Credentials",
    tabRouting: "Routing & Limits",
    tabDomain: "Domain & Proxy",
    tabDisplay: "Display Profile",
    tabReview: "Review",
    tabLegacy: "Legacy",

    // Form Overview/Info
    labelAccountName: "Account Name",
    labelEmail: "PayPal Email",
    labelInitialStatus: "Initial Status",
    
    // Stat boxes
    statTransactions: "Transactions",
    statSuccessRate: "Success Rate",
    statLastActive: "Last Active",

    // Form Credentials
    paypalApiCredentials: "PayPal API Credentials",
    paypalApiDesc: "Enter your PayPal REST API Client ID and Secret from the PayPal Developer Dashboard.",
    labelClientId: "Client ID",
    labelClientSecret: "Client Secret",
    credsEncrypted: "Credentials are encrypted at rest with AES-256 and never logged",
    btnTestPaypal: "Test PayPal Connection",
    btnTesting: "Testing connection...",
    testRequiresIds: "Enter Client ID and Secret to test",
    testConnected: "Connected to PayPal",

    // Form Routing
    adaptiveLimits: "Adaptive Volume Limits",
    adaptiveLimitsDescAdd: "Set soft and hard daily volume limits. The rotator shifts traffic away when nearing the soft limit.",
    adaptiveLimitsDescEdit: "Instead of a hard cutoff, the rotator shifts away from this account when it nears the soft limit, and locks it out at the hard limit.",
    labelSoftLimit: "Soft Limit ($)",
    labelHardLimit: "Hard Limit ($)",
    descSoftLimit: "Begin de-weighting",
    descHardLimit: "Full lockout threshold",
    warmupModeActive: "Warm-up Mode Active",
    warmupDescEdit1: "• Max ",
    warmupDescEdit1Val: "$50",
    warmupDescEdit1End: " per transaction to build account trust",
    warmupDescEdit2: "• Progressive daily cap: ",
    warmupDescEdit2Val1: "$100",
    warmupDescEdit2Day1: " (Day 1) → ",
    warmupDescEdit2Val2: "$500",
    warmupDescEdit2Day7: " (Day 7+)",
    warmupDescEdit3: "• Account is deprioritised for orders over $100",
    warmupDescAdd: "Warm-up mode ignores limits temporarily. It limits transactions to $50 each with a progressive daily cap ($100 → $500) over 7 days.",
    
    labelStatus: "Status",
    suspendedDesc: "Suspended accounts are excluded from the rotation pool entirely. No transactions will be routed to this account.",
    labelPriority: "Rotation Priority",

    // Form Domain & Proxy
    shieldDomain: "Shield Domain",
    btnPlatformDomain: "Platform Domain",
    btnCustomDomain: "Custom Domain",
    labelSelectPlatform: "Select Platform Domain",
    labelCustomDomain: "Custom Domain",
    platformManagedBy: "Managed and monitored by Gateway Central",
    platformVerifyFirst: "Verify a domain in Domains before assigning it to an account.",
    platformNoLongerVerified: "The current platform domain is no longer verified. Select another verified domain before saving.",
    customDomainWarning: "You are responsible for DNS configuration and SSL",
    selectVerifiedPlaceholder: "Select a verified platform domain",
    noVerifiedPlaceholder: "No verified platform domains available",
    
    staticProxy: "Proxy Configuration",
    staticProxyAdd: "Static Proxy",
    proxyDescEdit: "Route PayPal API calls through a proxy to diversify IP origins. Supports HTTP, HTTPS, and SOCKS5 protocols.",
    proxyDescAdd: "Supports HTTP, HTTPS, and SOCKS5.",
    labelProxyUrl: "Proxy URL",
    labelProxyOptional: "Proxy URL (Optional)",
    btnRemoveProxy: "Remove Proxy",
    proxyHiddenWarning: "Proxy URL may contain credentials — it is masked in the UI and never logged",

    // Form Display Profile
    paymentDisplayProfile: "Payment Display Profile",
    displayProfileDescEdit: "Select a preferred display profile to route transactions through this account when the store uses this profile.",
    displayProfileDescAdd: "Optional. When assigned, this account is preferred for stores using the same Payment Display Profile.",
    noneProfile: "None (Use fallback accounts)",

    // Form Legacy
    legacyMasking: "Legacy Masking",
    legacyDeprecated: "Deprecated. New stores should use Payment Display Profiles. This legacy setting only controls the old fake_product_name override.",
    labelLegacyProduct: "Legacy Fake Product Name",
    labelPresets: "Presets",
    receiptWillShow: "PayPal receipt will show: ",

    // Danger Zone
    dangerZone: "Danger Zone",
    dangerDesc: "Permanently removes this account from the rotator. All routing will stop immediately.",
    btnRemoveAccount: "Remove Account",

    // Form Review
    reviewAccountDetails: "Review Account Details",
    reviewName: "Account Name",
    reviewEmail: "PayPal Email",
    reviewInitialStatus: "Initial Status",
    reviewShieldDomain: "Shield Domain",
    reviewProfile: "Display Profile",
    reviewLimits: "Limits",
    reviewProxy: "Proxy Configured",
    reviewProxyYes: "Yes",
    reviewProxyNo: "No",
    reviewEncryptedWarning: "Credentials have been entered and will be encrypted before storage. Client Secret is hidden for security.",

    // Messages
    msgSavedSuccess: "Account changes saved successfully.",
    msgCreatedSuccess: "Account created successfully.",
    msgGenericError: "Unable to save changes. Please try again.",

    // Misc Badges
    inheritStoreDefault: "Inherit Store Default",
    unknownProfile: "Unknown profile",
    softSuffix: " soft",
    hardSuffix: " hard"
  },
  vi: {
    title: "Tài khoản thanh toán",
    description: "Quản lý tài khoản thanh toán, định tuyến, hạn mức, hồ sơ hiển thị và Identity Bundle.",
    eyebrow: "TÀI KHOẢN",
    
    // Summary card
    totalVolumeToday: "Doanh số hôm nay",
    activeAccounts: "tài khoản đang hoạt động",

    // Tabs / Filters
    filterAll: "Tất cả",
    filterActive: "Đang hoạt động",
    filterLimited: "Bị giới hạn",
    filterWarmUp: "Đang warm-up",
    filterPaused: "Tạm dừng",
    filterSuspended: "Bị tạm ngưng",

    // Action buttons
    sync: "Đồng bộ",
    syncing: "Đang đồng bộ...",
    addAccount: "Thêm tài khoản",
    editAccount: "Sửa tài khoản",

    // Table Headers
    thAccountName: "Tên tài khoản",
    thShieldDomain: "Tên miền bảo vệ",
    thStatus: "Trạng thái",
    thDisplayProfile: "Hồ sơ hiển thị",
    thDailyVolume: "Hạn mức doanh số",
    thPriority: "Độ ưu tiên",
    thTx: "Giao dịch",
    
    // Empty state
    noAccountsFound: "Chưa có tài khoản",
    noAccountsDesc: "Không có tài khoản nào phù hợp với bộ lọc hiện tại.",

    // Drawer / Modal common
    btnCancel: "Hủy",
    btnSave: "Lưu thay đổi",
    btnSaving: "Đang lưu...",
    btnSaved: "Đã lưu",
    btnAdd: "Thêm tài khoản",
    btnAdding: "Đang thêm...",
    btnAdded: "Đã thêm",

    // Add Merchant Modal
    addModalTitle: "Thêm tài khoản thanh toán",
    addModalDesc: "Kết nối tài khoản từ nhà cung cấp và cấu hình định tuyến.",

    // Edit Slide Over
    editing: "Đang sửa",

    // Tabs
    tabInfo: "Thông tin",
    tabOverview: "Tổng quan",
    tabCredentials: "Thông tin kết nối",
    tabRouting: "Định tuyến & hạn mức",
    tabDomain: "Tên miền & proxy",
    tabDisplay: "Hồ sơ hiển thị",
    tabReview: "Xem lại",
    tabLegacy: "Cũ",

    // Form Overview/Info
    labelAccountName: "Tên tài khoản",
    labelEmail: "Email tài khoản",
    labelInitialStatus: "Trạng thái ban đầu",
    
    // Stat boxes
    statTransactions: "Số giao dịch",
    statSuccessRate: "Tỉ lệ thành công",
    statLastActive: "Lần hoạt động cuối",

    // Form Credentials
    paypalApiCredentials: "Thông tin kết nối PayPal",
    paypalApiDesc: "Nhập Client ID và Secret của PayPal REST API từ trang PayPal Developer.",
    labelClientId: "Client ID",
    labelClientSecret: "Client Secret",
    credsEncrypted: "Secret được mã hóa AES-256 và sẽ không hiển thị lại",
    btnTestPaypal: "Kiểm tra kết nối",
    btnTesting: "Đang kiểm tra...",
    testRequiresIds: "Cần nhập Client ID và Secret để kiểm tra",
    testConnected: "Đã kết nối PayPal",

    // Form Routing
    adaptiveLimits: "Hạn mức doanh số thích ứng",
    adaptiveLimitsDescAdd: "Thiết lập hạn mức mềm và cứng. Hệ thống sẽ giảm dần định tuyến khi gần đạt hạn mức mềm.",
    adaptiveLimitsDescEdit: "Hệ thống sẽ giảm dần định tuyến khi gần đạt hạn mức mềm, và ngừng định tuyến hoàn toàn ở hạn mức cứng.",
    labelSoftLimit: "Hạn mức mềm ($)",
    labelHardLimit: "Hạn mức cứng ($)",
    descSoftLimit: "Bắt đầu giảm trọng số",
    descHardLimit: "Ngừng định tuyến hoàn toàn",
    warmupModeActive: "Chế độ Warm-up đang bật",
    warmupDescEdit1: "• Tối đa ",
    warmupDescEdit1Val: "$50",
    warmupDescEdit1End: " mỗi giao dịch để xây dựng uy tín",
    warmupDescEdit2: "• Giới hạn doanh số tăng dần: ",
    warmupDescEdit2Val1: "$100",
    warmupDescEdit2Day1: " (Ngày 1) → ",
    warmupDescEdit2Val2: "$500",
    warmupDescEdit2Day7: " (Ngày 7+)",
    warmupDescEdit3: "• Sẽ không được định tuyến cho đơn hàng trên $100",
    warmupDescAdd: "Chế độ warm-up tạm thời bỏ qua các hạn mức. Sẽ giới hạn $50/giao dịch và doanh số tăng dần ($100 → $500) trong 7 ngày.",
    
    labelStatus: "Trạng thái",
    suspendedDesc: "Tài khoản bị tạm ngưng sẽ bị loại khỏi hệ thống định tuyến. Không có giao dịch nào được chuyển vào tài khoản này.",
    labelPriority: "Độ ưu tiên",

    // Form Domain & Proxy
    shieldDomain: "Tên miền bảo vệ (Shield Domain)",
    btnPlatformDomain: "Tên miền hệ thống",
    btnCustomDomain: "Tên miền tùy chỉnh",
    labelSelectPlatform: "Chọn tên miền hệ thống",
    labelCustomDomain: "Tên miền tùy chỉnh",
    platformManagedBy: "Được quản lý và giám sát bởi Gateway Central",
    platformVerifyFirst: "Xác minh tên miền trong mục Domains trước khi gán cho tài khoản.",
    platformNoLongerVerified: "Tên miền hiện tại không còn được xác minh. Hãy chọn tên miền khác trước khi lưu.",
    customDomainWarning: "Bạn tự chịu trách nhiệm cấu hình DNS và SSL",
    selectVerifiedPlaceholder: "Chọn tên miền đã xác minh",
    noVerifiedPlaceholder: "Không có tên miền nào khả dụng",
    
    staticProxy: "Cấu hình Proxy",
    staticProxyAdd: "Proxy tĩnh",
    proxyDescEdit: "Định tuyến API qua proxy để đa dạng IP. Hỗ trợ HTTP, HTTPS và SOCKS5.",
    proxyDescAdd: "Hỗ trợ HTTP, HTTPS và SOCKS5.",
    labelProxyUrl: "Proxy URL",
    labelProxyOptional: "Proxy URL (Tùy chọn)",
    btnRemoveProxy: "Xóa Proxy",
    proxyHiddenWarning: "Proxy URL có thể chứa mật khẩu — nó được ẩn đi và không bao giờ được log lại",

    // Form Display Profile
    paymentDisplayProfile: "Hồ sơ hiển thị thanh toán",
    displayProfileDescEdit: "Chọn hồ sơ hiển thị ưu tiên khi có store sử dụng hồ sơ này.",
    displayProfileDescAdd: "Tùy chọn. Tài khoản này sẽ được ưu tiên cho các store có cùng Hồ sơ hiển thị.",
    noneProfile: "Không (Dùng tài khoản dự phòng)",

    // Form Legacy
    legacyMasking: "Masking bản cũ",
    legacyDeprecated: "Đã lỗi thời. Vui lòng dùng Payment Display Profiles. Cài đặt này chỉ dùng cho fake_product_name bản cũ.",
    labelLegacyProduct: "Tên sản phẩm giả (cũ)",
    labelPresets: "Mẫu sẵn có",
    receiptWillShow: "Biên lai PayPal sẽ hiển thị: ",

    // Danger Zone
    dangerZone: "Khu vực nguy hiểm",
    dangerDesc: "Xóa vĩnh viễn tài khoản khỏi hệ thống. Quá trình định tuyến sẽ dừng ngay lập tức.",
    btnRemoveAccount: "Xóa tài khoản",

    // Form Review
    reviewAccountDetails: "Xem lại thông tin",
    reviewName: "Tên tài khoản",
    reviewEmail: "Email tài khoản",
    reviewInitialStatus: "Trạng thái ban đầu",
    reviewShieldDomain: "Tên miền bảo vệ",
    reviewProfile: "Hồ sơ hiển thị",
    reviewLimits: "Hạn mức",
    reviewProxy: "Có dùng proxy",
    reviewProxyYes: "Có",
    reviewProxyNo: "Không",
    reviewEncryptedWarning: "Thông tin kết nối đã được nhập và sẽ được mã hóa khi lưu. Client Secret đã được ẩn đi để bảo mật.",

    // Messages
    msgSavedSuccess: "Đã lưu thay đổi thành công.",
    msgCreatedSuccess: "Tạo tài khoản thành công.",
    msgGenericError: "Không thể lưu thay đổi. Vui lòng thử lại.",

    // Misc Badges
    inheritStoreDefault: "Kế thừa mặc định store",
    unknownProfile: "Hồ sơ không xác định",
    softSuffix: " mềm",
    hardSuffix: " cứng"
  }
}
