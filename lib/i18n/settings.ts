export const settingsCopy = {
  en: {
    // Shared
    saving: "Saving...",
    saved: "Saved",
    cancel: "Cancel",
    networkError: "Network error",
    saveFailed: "Save failed: ",
    
    // Page Header
    eyebrow: "CONFIGURATION",
    title: "Settings",
    description: "Manage your stores, notifications, and account security",
    personalizedSecurity: "Personalized Security & Alerts — your configuration is isolated to your tenant",

    // Store List
    noStoresConfigured: "No stores configured yet",
    createStorePrompt: "Create a store from the Stores page to get started",
    active: "Active",
    inactive: "Inactive",

    // Store Settings
    apiKeyHash: "API Key Hash",
    apiKeyDesc: "Your API key was shown once at creation. Contact admin if you need it regenerated.",
    webhookUrl: "Webhook URL",
    notConfigured: "Not configured",
    webhookDesc: "Gateway sends IPN notifications to this URL. Update via the Stores page.",

    // Capture Mode
    manualCapture: "Manual Capture (Delayed)",
    manualCaptureDesc: "If enabled, payments will be Authorized only. You must manually capture them from the Transaction Log within 7 days.",

    // Checkout Experience
    checkoutExperience: "Checkout Experience",
    usePlatformDefault: "Use Platform Default",
    currentlyUsing: "Currently using",
    classicRedirect: "Classic Redirect",
    classicRedirectDesc: "Buyer leaves the store page and completes approval on PayPal in the same tab.",
    popupBridge: "Popup + Shield Bridge",
    popupBridgeDesc: "Buyer approves inside a popup while the shield domain handles return and cancel.",

    // Payment Display Profile
    paymentDisplayProfile: "Payment Display Profile",
    industryVertical: "Industry Vertical",
    indAuto: "Automotive / Tires",
    indElectronics: "Electronics",
    indHome: "Home Goods",
    indToys: "Toys & Gifts",
    indBeauty: "Beauty / Fragrance",
    indApparel: "Apparel",
    indGeneric: "Generic Ecommerce",
    displayMode: "Display Mode",
    modeBrandSemantic: "Brand + Semantic Order",
    modeSemantic: "Semantic Order Only",
    modeSanitized: "Sanitized Real Product Name",
    modeLegacy: "Deprecated: Legacy Generic",
    publicBrandName: "Public Brand Name",
    descriptorPrefix: "Descriptor Prefix",
    lineItemPolicy: "Line Item Policy",
    policySingle: "Single Order Summary",
    policyReal: "Real Cart Items",
    policyLegacy: "Legacy Random Split",
    legacyModeWarning: "Generic service descriptors may confuse buyers. Recommended: Brand + Semantic Order.",
    legacyPolicyWarning: "This may create multiple PayPal line items that do not match the buyer's cart. Recommended: Single Order Summary.",
    livePreview: "Live Preview",
    buyerMaySee: "Buyer may see: ",
    loading: "Loading...",
    previewFooter: "Your store receipt will still show the real product details.",
    saveProfile: "Save Profile",

    // Notifications
    notifications: "Notifications",
    telegramDesc: "Receive Telegram alerts for every successful payment",
    botFatherInstructions: "Create a bot via @BotFather on Telegram, add it to your group, and paste the credentials below.",
    telegramBotToken: "Telegram Bot Token",
    chatId: "Chat ID",
    saveTelegramConfig: "Save Telegram Config",
    sending: "Sending...",
    sendTestAlert: "Send Test Alert",
    telegramExample: "You'll receive: 💰 Success! Received $X from [Store]. Account: [PP-ID].",

    // Password
    changePassword: "Change Password",
    changePasswordDesc: "Update your dashboard login password",
    currentPassword: "Current Password",
    newPassword: "New Password",
    min12Chars: "Min 12 characters",
    passwordLengthWarning: "Password must be at least 12 characters",
    updating: "Updating...",
    updatePassword: "Update Password",
    bcryptDesc: "Passwords are hashed with bcrypt (12 rounds) and never stored in plain text",
    bothFieldsRequired: "Both fields are required",

    // Email
    changeEmail: "Change Email",
    changeEmailDesc: "Update your login email — requires OTP verification",
    currentEmail: "Current Email",
    newEmailAddress: "New Email Address",
    sendVerificationCode: "Send Verification Code",
    otpInstructions: "A 6-digit code will be sent to your current email for verification. Code expires in 10 minutes.",
    enterVerificationCode: "Enter Verification Code",
    otpSentMsg: "A 6-digit code has been sent to your current email. Enter it below to confirm the change.",
    sixDigitCode: "6-Digit Code",
    verifying: "Verifying...",
    verifyUpdateEmail: "Verify & Update Email",
    invalidEmail: "Enter a valid email address",
    enter6Digit: "Enter the 6-digit code",
  },
  vi: {
    // Shared
    saving: "Đang lưu...",
    saved: "Đã lưu",
    cancel: "Hủy",
    networkError: "Lỗi mạng",
    saveFailed: "Lỗi khi lưu: ",

    // Page Header
    eyebrow: "CẤU HÌNH",
    title: "Cài đặt",
    description: "Quản lý cửa hàng, thông báo và bảo mật tài khoản",
    personalizedSecurity: "Bảo mật & Cảnh báo cá nhân — cấu hình của bạn được cô lập cho tài khoản của bạn",

    // Store List
    noStoresConfigured: "Chưa có cửa hàng nào được cấu hình",
    createStorePrompt: "Tạo một cửa hàng từ trang Cửa hàng để bắt đầu",
    active: "Đang hoạt động",
    inactive: "Không hoạt động",

    // Store Settings
    apiKeyHash: "Mã Băm API Key",
    apiKeyDesc: "API key của bạn chỉ được hiển thị một lần khi tạo. Liên hệ admin nếu bạn cần tạo lại.",
    webhookUrl: "URL Webhook",
    notConfigured: "Chưa cấu hình",
    webhookDesc: "Gateway gửi thông báo IPN đến URL này. Cập nhật thông qua trang Cửa hàng.",

    // Capture Mode
    manualCapture: "Thu tiền thủ công (Trì hoãn)",
    manualCaptureDesc: "Nếu bật, các khoản thanh toán sẽ chỉ được Ủy quyền. Bạn phải tự thu tiền từ Nhật ký Giao dịch trong vòng 7 ngày.",

    // Checkout Experience
    checkoutExperience: "Trải nghiệm thanh toán",
    usePlatformDefault: "Dùng mặc định của nền tảng",
    currentlyUsing: "Hiện đang sử dụng",
    classicRedirect: "Classic Redirect",
    classicRedirectDesc: "Người mua rời khỏi trang cửa hàng và hoàn tất xác nhận trên PayPal trong cùng một tab.",
    popupBridge: "Popup + Shield Bridge",
    popupBridgeDesc: "Người mua xác nhận trong popup trong khi tên miền shield xử lý trả về và hủy.",

    // Payment Display Profile
    paymentDisplayProfile: "Hồ sơ hiển thị thanh toán",
    industryVertical: "Ngành hàng",
    indAuto: "Ô tô / Lốp xe",
    indElectronics: "Điện tử",
    indHome: "Đồ gia dụng",
    indToys: "Đồ chơi & Quà tặng",
    indBeauty: "Làm đẹp / Nước hoa",
    indApparel: "Quần áo",
    indGeneric: "Thương mại điện tử chung",
    displayMode: "Chế độ hiển thị",
    modeBrandSemantic: "Thương hiệu + Đơn hàng theo ngữ nghĩa",
    modeSemantic: "Chỉ Đơn hàng theo ngữ nghĩa",
    modeSanitized: "Tên sản phẩm thật đã được làm sạch",
    modeLegacy: "Không dùng nữa: Chung chung cũ",
    publicBrandName: "Tên thương hiệu công khai",
    descriptorPrefix: "Tiền tố mô tả",
    lineItemPolicy: "Chính sách dòng sản phẩm",
    policySingle: "Tóm tắt một đơn hàng",
    policyReal: "Sản phẩm thật trong giỏ hàng",
    policyLegacy: "Chia ngẫu nhiên kiểu cũ",
    legacyModeWarning: "Mô tả dịch vụ chung chung có thể gây nhầm lẫn cho người mua. Khuyến nghị: Thương hiệu + Đơn hàng theo ngữ nghĩa.",
    legacyPolicyWarning: "Điều này có thể tạo ra nhiều dòng sản phẩm PayPal không khớp với giỏ hàng. Khuyến nghị: Tóm tắt một đơn hàng.",
    livePreview: "Xem trước",
    buyerMaySee: "Người mua có thể thấy: ",
    loading: "Đang tải...",
    previewFooter: "Biên lai cửa hàng vẫn sẽ hiển thị chi tiết sản phẩm thật.",
    saveProfile: "Lưu hồ sơ",

    // Notifications
    notifications: "Thông báo",
    telegramDesc: "Nhận cảnh báo Telegram cho mọi thanh toán thành công",
    botFatherInstructions: "Tạo một bot qua @BotFather trên Telegram, thêm nó vào nhóm của bạn và dán thông tin đăng nhập bên dưới.",
    telegramBotToken: "Telegram Bot Token",
    chatId: "Telegram Chat ID",
    saveTelegramConfig: "Lưu Cấu Hình Telegram",
    sending: "Đang gửi...",
    sendTestAlert: "Gửi thông báo thử",
    telegramExample: "Bạn sẽ nhận được: 💰 Thành công! Đã nhận $X từ [Cửa hàng]. Tài khoản: [PP-ID].",

    // Password
    changePassword: "Đổi Mật Khẩu",
    changePasswordDesc: "Cập nhật mật khẩu đăng nhập trang quản trị của bạn",
    currentPassword: "Mật khẩu hiện tại",
    newPassword: "Mật khẩu mới",
    min12Chars: "Tối thiểu 12 ký tự",
    passwordLengthWarning: "Mật khẩu phải có ít nhất 12 ký tự",
    updating: "Đang cập nhật...",
    updatePassword: "Cập nhật Mật khẩu",
    bcryptDesc: "Mật khẩu được băm bằng bcrypt (12 vòng) và không bao giờ được lưu trữ dưới dạng văn bản thuần",
    bothFieldsRequired: "Cần nhập cả hai trường",

    // Email
    changeEmail: "Đổi Email",
    changeEmailDesc: "Cập nhật email đăng nhập của bạn — yêu cầu xác minh mã OTP",
    currentEmail: "Email hiện tại",
    newEmailAddress: "Địa chỉ email mới",
    sendVerificationCode: "Gửi mã xác minh",
    otpInstructions: "Một mã gồm 6 chữ số sẽ được gửi đến email hiện tại của bạn để xác minh. Mã sẽ hết hạn trong 10 phút.",
    enterVerificationCode: "Nhập mã xác minh",
    otpSentMsg: "Một mã gồm 6 chữ số đã được gửi đến email hiện tại. Nhập nó vào bên dưới để xác nhận thay đổi.",
    sixDigitCode: "Mã 6 chữ số",
    verifying: "Đang xác minh...",
    verifyUpdateEmail: "Xác minh & Cập nhật Email",
    invalidEmail: "Nhập địa chỉ email hợp lệ",
    enter6Digit: "Nhập mã 6 chữ số",
  }
}
