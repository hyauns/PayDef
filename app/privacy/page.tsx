"use client"

import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import { Shield, Globe, ArrowLeft, ChevronRight } from "lucide-react"

type Lang = "en" | "vi"

// ─── Content ───────────────────────────────────────────────────────────────────
const CONTENT = {
    en: {
        back: "Back to Home",
        badge: "Legal Document",
        title: "Privacy Policy",
        subtitle: "Gateway Central — Payment Infrastructure Platform",
        updated: "Last updated: April 4, 2026 · Effective: April 4, 2026",
        intro:
            "Gateway Central ('we', 'our', or 'the Company') is committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, store, and protect your data when you use our platform. By accessing or using our services, you agree to the practices described in this document.",
        toc_title: "Table of Contents",
        sections: [
            {
                id: "s1",
                title: "1. Information We Collect",
                content: [
                    {
                        sub: "1.1 Account & Identity Information",
                        body: "When you register for a merchant account, we collect: full name or business name, email address, phone number, business registration details, and PayPal account identifiers (Client ID only — secret keys are encrypted at rest using AES-256). We never store your PayPal password.",
                    },
                    {
                        sub: "1.2 Transaction Data",
                        body: "We collect and process data related to payment transactions, including: transaction amounts, currency, order references, masked item descriptions, timestamps, originating IP addresses, and transaction status. Raw product names may be stored in encrypted form for audit purposes and are not shared with third parties.",
                    },
                    {
                        sub: "1.3 Technical & Usage Data",
                        body: "We automatically collect: IP addresses, browser type, operating system, device identifiers, pages visited, referral URLs, session duration, and API call logs. This data is used for security monitoring, fraud prevention, and service improvement.",
                    },
                    {
                        sub: "1.4 Communication Data",
                        body: "When you contact our support team or submit inquiries via the contact form, we collect and retain the content of your messages, your email address, and any attachments you provide.",
                    },
                ],
            },
            {
                id: "s2",
                title: "2. How We Use Your Information",
                content: [
                    {
                        sub: "2.1 Service Delivery",
                        body: "We use your information to create and manage your account, process and route payment transactions, operate the merchant rotation and volume management systems, provide API access credentials, and deliver technical support.",
                    },
                    {
                        sub: "2.2 Security & Fraud Prevention",
                        body: "We use collected data to detect, investigate, and prevent fraudulent transactions, unauthorized access, and violations of our Terms of Use. Risk signals are processed automatically and may result in temporary account restrictions pending manual review.",
                    },
                    {
                        sub: "2.3 Legal Compliance",
                        body: "We may process your data to comply with applicable laws, regulations, and binding legal orders from courts or government authorities, including anti-money laundering (AML) obligations and financial reporting requirements.",
                    },
                    {
                        sub: "2.4 Communications",
                        body: "With your consent, we may send service announcements, security alerts, billing notifications, and product updates. You may opt out of non-essential communications at any time via your account settings or by contacting us directly.",
                    },
                ],
            },
            {
                id: "s3",
                title: "3. Data Storage & Security",
                content: [
                    {
                        sub: "3.1 Storage Infrastructure",
                        body: "All data is stored on servers hosted within the European Economic Area (EEA) or with providers that comply with Standard Contractual Clauses (SCCs) for international data transfers. Our database infrastructure uses Neon Serverless PostgreSQL with encryption at rest.",
                    },
                    {
                        sub: "3.2 Encryption Standards",
                        body: "PayPal API credentials are encrypted using AES-256 before storage. Passwords are hashed using bcrypt with a minimum cost factor of 12. API keys are hashed with bcrypt and presented to users only once at the point of creation — plaintext keys are never stored.",
                    },
                    {
                        sub: "3.3 Access Controls",
                        body: "Access to production databases is restricted to authorized personnel with documented business need. All access events are logged. We enforce multi-factor authentication (MFA) for all administrative accounts. Row-level security policies ensure tenant data isolation.",
                    },
                    {
                        sub: "3.4 Retention",
                        body: "Transaction data is retained for a minimum of 5 years to satisfy financial regulatory requirements. Account data is retained for the duration of the contract plus 2 years after termination. Log data is retained for 12 months. You may request earlier deletion subject to legal constraints.",
                    },
                ],
            },
            {
                id: "s4",
                title: "4. Data Sharing & Third Parties",
                content: [
                    {
                        sub: "4.1 Payment Processors",
                        body: "We transmit transaction data to PayPal Inc. as required to process payments. PayPal's data processing is governed by PayPal's own Privacy Policy and applicable financial regulations. We do not sell your data to PayPal for marketing purposes.",
                    },
                    {
                        sub: "4.2 Infrastructure Providers",
                        body: "We use the following sub-processors: Vercel Inc. (hosting and edge functions), Neon Inc. (database), and Vercel Analytics (aggregated usage analytics). Each provider is bound by data processing agreements that prohibit them from using your data for their own purposes.",
                    },
                    {
                        sub: "4.3 No Data Sales",
                        body: "We do not sell, rent, trade, or otherwise transfer your personal information to third parties for their commercial benefit. Any sharing is strictly limited to what is necessary to operate our services or comply with the law.",
                    },
                    {
                        sub: "4.4 Legal Disclosures",
                        body: "We may disclose your data if required by valid legal process (court orders, subpoenas, regulatory demands). Where permitted by law, we will notify you of such requests before disclosing your information.",
                    },
                ],
            },
            {
                id: "s5",
                title: "5. Your Rights",
                content: [
                    {
                        sub: "5.1 Access & Portability",
                        body: "You have the right to request a copy of all personal data we hold about you in a structured, machine-readable format (JSON or CSV). Requests must be submitted via your account dashboard or by contacting our Data Protection Officer.",
                    },
                    {
                        sub: "5.2 Rectification",
                        body: "You have the right to correct inaccurate or incomplete personal data. Account profile fields can be updated directly in your dashboard. For data embedded in immutable records (e.g., transaction logs), we will note the correction in associated metadata.",
                    },
                    {
                        sub: "5.3 Erasure ('Right to be Forgotten')",
                        body: "You may request deletion of your personal data where it is no longer necessary for the purposes it was collected, where you withdraw consent, or where you object to processing and there are no legitimate grounds for continued processing. Certain data may be retained to satisfy legal obligations.",
                    },
                    {
                        sub: "5.4 Restriction & Objection",
                        body: "You may request that we restrict processing of your data while a dispute is resolved. You may object to processing based on our legitimate interests. Where you object to direct marketing, we will always honor that request unconditionally.",
                    },
                    {
                        sub: "5.5 Lodging Complaints",
                        body: "If you believe we have violated applicable data protection law, you have the right to lodge a complaint with the relevant supervisory authority. In Vietnam, this is the Ministry of Public Security (Bộ Công An). In the EU/EEA, the competent authority is determined by your country of residence.",
                    },
                ],
            },
            {
                id: "s6",
                title: "6. Cookies & Tracking",
                content: [
                    {
                        sub: "6.1 Essential Cookies",
                        body: "We use session cookies to maintain your authenticated state (via NextAuth.js JWT tokens stored as HTTP-only cookies). These are strictly necessary and cannot be disabled without breaking core functionality.",
                    },
                    {
                        sub: "6.2 Analytics",
                        body: "We use Vercel Analytics to collect aggregated, anonymized usage statistics. No personal identifiers are transmitted to Vercel Analytics. You may opt out by enabling the 'Do Not Track' header in your browser.",
                    },
                    {
                        sub: "6.3 No Third-Party Advertising",
                        body: "We do not use advertising cookies, tracking pixels, or third-party retargeting technologies. We do not participate in behavioral advertising networks.",
                    },
                ],
            },
            {
                id: "s7",
                title: "7. Changes to This Policy",
                content: [
                    {
                        sub: "",
                        body: "We may update this Privacy Policy periodically. Material changes will be communicated via email (to the address on your account) and via an in-platform notice at least 14 days before taking effect. Continued use of the platform after the effective date constitutes acceptance of the updated policy. Prior versions will be archived and made available upon request.",
                    },
                ],
            },
            {
                id: "s8",
                title: "8. Contact & Data Protection Officer",
                content: [
                    {
                        sub: "",
                        body: "For all privacy-related inquiries, data access requests, or to exercise your rights, please contact our Data Protection Officer at: privacy@gatewaycentral.io. We will respond to all verifiable requests within 30 calendar days. For urgent security matters, please include 'URGENT' in the subject line.",
                    },
                ],
            },
        ],
    },

    vi: {
        back: "Quay về Trang chủ",
        badge: "Tài liệu Pháp lý",
        title: "Chính sách Bảo mật",
        subtitle: "Gateway Central — Nền tảng Hạ tầng Thanh toán",
        updated: "Cập nhật lần cuối: 04 tháng 04, 2026 · Có hiệu lực: 04 tháng 04, 2026",
        intro:
            "Gateway Central ('chúng tôi', 'của chúng tôi', hoặc 'Công ty') cam kết bảo vệ thông tin cá nhân và quyền riêng tư của bạn. Chính sách Bảo mật này giải thích cách chúng tôi thu thập, sử dụng, lưu trữ và bảo vệ dữ liệu của bạn khi bạn sử dụng nền tảng của chúng tôi. Bằng cách truy cập hoặc sử dụng dịch vụ của chúng tôi, bạn đồng ý với các thực tiễn được mô tả trong tài liệu này.",
        toc_title: "Mục lục",
        sections: [
            {
                id: "s1",
                title: "1. Thông tin Chúng tôi Thu thập",
                content: [
                    {
                        sub: "1.1 Thông tin Tài khoản & Danh tính",
                        body: "Khi bạn đăng ký tài khoản merchant, chúng tôi thu thập: tên đầy đủ hoặc tên doanh nghiệp, địa chỉ email, số điện thoại, thông tin đăng ký kinh doanh và số định danh tài khoản PayPal (chỉ Client ID — khóa bí mật được mã hóa bằng AES-256). Chúng tôi không bao giờ lưu trữ mật khẩu PayPal của bạn.",
                    },
                    {
                        sub: "1.2 Dữ liệu Giao dịch",
                        body: "Chúng tôi thu thập và xử lý dữ liệu liên quan đến giao dịch thanh toán, bao gồm: số tiền giao dịch, loại tiền tệ, mã tham chiếu đơn hàng, mô tả sản phẩm đã được che giấu, dấu thời gian, địa chỉ IP nguồn và trạng thái giao dịch. Tên sản phẩm gốc có thể được lưu trữ ở dạng mã hóa cho mục đích kiểm toán và không được chia sẻ với bên thứ ba.",
                    },
                    {
                        sub: "1.3 Dữ liệu Kỹ thuật & Sử dụng",
                        body: "Chúng tôi tự động thu thập: địa chỉ IP, loại trình duyệt, hệ điều hành, số định danh thiết bị, các trang đã truy cập, URL giới thiệu, thời gian phiên và nhật ký cuộc gọi API. Dữ liệu này được sử dụng để giám sát bảo mật, phòng chống gian lận và cải thiện dịch vụ.",
                    },
                    {
                        sub: "1.4 Dữ liệu Liên lạc",
                        body: "Khi bạn liên hệ với đội ngũ hỗ trợ hoặc gửi yêu cầu qua biểu mẫu liên hệ, chúng tôi thu thập và lưu giữ nội dung tin nhắn, địa chỉ email và các tệp đính kèm bạn cung cấp.",
                    },
                ],
            },
            {
                id: "s2",
                title: "2. Cách Chúng tôi Sử dụng Thông tin của Bạn",
                content: [
                    {
                        sub: "2.1 Cung cấp Dịch vụ",
                        body: "Chúng tôi sử dụng thông tin của bạn để tạo và quản lý tài khoản, xử lý và định tuyến giao dịch thanh toán, vận hành hệ thống xoay vòng merchant và quản lý khối lượng giao dịch, cung cấp thông tin xác thực API và hỗ trợ kỹ thuật.",
                    },
                    {
                        sub: "2.2 Bảo mật & Phòng chống Gian lận",
                        body: "Chúng tôi sử dụng dữ liệu thu thập được để phát hiện, điều tra và ngăn chặn các giao dịch gian lận, truy cập trái phép và vi phạm Điều khoản Sử dụng. Các tín hiệu rủi ro được xử lý tự động và có thể dẫn đến hạn chế tài khoản tạm thời trong khi chờ xem xét thủ công.",
                    },
                    {
                        sub: "2.3 Tuân thủ Pháp luật",
                        body: "Chúng tôi có thể xử lý dữ liệu của bạn để tuân thủ các luật, quy định hiện hành và các lệnh pháp lý ràng buộc từ tòa án hoặc cơ quan chính phủ, bao gồm các nghĩa vụ phòng chống rửa tiền (AML) và yêu cầu báo cáo tài chính.",
                    },
                    {
                        sub: "2.4 Truyền thông",
                        body: "Với sự đồng ý của bạn, chúng tôi có thể gửi thông báo dịch vụ, cảnh báo bảo mật, thông báo thanh toán và cập nhật sản phẩm. Bạn có thể hủy đăng ký các thông tin liên lạc không cần thiết bất kỳ lúc nào qua cài đặt tài khoản hoặc liên hệ trực tiếp với chúng tôi.",
                    },
                ],
            },
            {
                id: "s3",
                title: "3. Lưu trữ & Bảo mật Dữ liệu",
                content: [
                    {
                        sub: "3.1 Cơ sở hạ tầng Lưu trữ",
                        body: "Tất cả dữ liệu được lưu trữ trên các máy chủ trong Khu vực Kinh tế Châu Âu (EEA) hoặc với các nhà cung cấp tuân thủ Điều khoản Hợp đồng Chuẩn (SCCs) cho việc truyền dữ liệu quốc tế. Cơ sở hạ tầng cơ sở dữ liệu sử dụng Neon Serverless PostgreSQL với mã hóa khi lưu trữ.",
                    },
                    {
                        sub: "3.2 Tiêu chuẩn Mã hóa",
                        body: "Thông tin xác thực API PayPal được mã hóa bằng AES-256 trước khi lưu trữ. Mật khẩu được băm bằng bcrypt với hệ số chi phí tối thiểu là 12. Khóa API được băm bằng bcrypt và chỉ được hiển thị cho người dùng một lần tại thời điểm tạo — khóa văn bản thuần túy không bao giờ được lưu trữ.",
                    },
                    {
                        sub: "3.3 Kiểm soát Truy cập",
                        body: "Quyền truy cập cơ sở dữ liệu sản xuất bị hạn chế đối với nhân viên được ủy quyền với nhu cầu kinh doanh được ghi lại. Tất cả các sự kiện truy cập đều được ghi lại. Chúng tôi thực thi xác thực đa yếu tố (MFA) cho tất cả tài khoản quản trị. Chính sách bảo mật cấp hàng đảm bảo cách ly dữ liệu tenant.",
                    },
                    {
                        sub: "3.4 Thời gian Lưu giữ",
                        body: "Dữ liệu giao dịch được lưu giữ tối thiểu 5 năm để đáp ứng các yêu cầu quy định tài chính. Dữ liệu tài khoản được lưu giữ trong thời hạn hợp đồng cộng thêm 2 năm sau khi chấm dứt. Dữ liệu nhật ký được lưu giữ trong 12 tháng. Bạn có thể yêu cầu xóa sớm hơn tùy thuộc vào các ràng buộc pháp lý.",
                    },
                ],
            },
            {
                id: "s4",
                title: "4. Chia sẻ Dữ liệu & Bên thứ Ba",
                content: [
                    {
                        sub: "4.1 Đơn vị Xử lý Thanh toán",
                        body: "Chúng tôi truyền dữ liệu giao dịch cho PayPal Inc. khi cần thiết để xử lý thanh toán. Việc xử lý dữ liệu của PayPal được điều chỉnh bởi Chính sách Bảo mật của PayPal và các quy định tài chính hiện hành. Chúng tôi không bán dữ liệu của bạn cho PayPal để phục vụ mục đích marketing.",
                    },
                    {
                        sub: "4.2 Nhà cung cấp Cơ sở hạ tầng",
                        body: "Chúng tôi sử dụng các nhà xử lý phụ sau: Vercel Inc. (lưu trữ và edge functions), Neon Inc. (cơ sở dữ liệu) và Vercel Analytics (phân tích sử dụng tổng hợp). Mỗi nhà cung cấp bị ràng buộc bởi các thỏa thuận xử lý dữ liệu nghiêm cấm họ sử dụng dữ liệu của bạn cho mục đích riêng của họ.",
                    },
                    {
                        sub: "4.3 Không Bán Dữ liệu",
                        body: "Chúng tôi không bán, cho thuê, trao đổi hoặc chuyển giao thông tin cá nhân của bạn cho bên thứ ba để phục vụ lợi ích thương mại của họ. Mọi việc chia sẻ đều bị giới hạn nghiêm ngặt ở mức cần thiết để vận hành dịch vụ hoặc tuân thủ pháp luật.",
                    },
                    {
                        sub: "4.4 Tiết lộ Pháp lý",
                        body: "Chúng tôi có thể tiết lộ dữ liệu của bạn nếu được yêu cầu bởi quy trình pháp lý hợp lệ (lệnh tòa án, trát hầu tòa, yêu cầu quản lý). Khi pháp luật cho phép, chúng tôi sẽ thông báo cho bạn về các yêu cầu đó trước khi tiết lộ thông tin.",
                    },
                ],
            },
            {
                id: "s5",
                title: "5. Quyền của Bạn",
                content: [
                    {
                        sub: "5.1 Truy cập & Tính Khả chuyển",
                        body: "Bạn có quyền yêu cầu bản sao tất cả dữ liệu cá nhân chúng tôi lưu giữ về bạn ở định dạng có cấu trúc, có thể đọc bằng máy (JSON hoặc CSV). Yêu cầu phải được gửi qua bảng điều khiển tài khoản hoặc bằng cách liên hệ với Cán bộ Bảo vệ Dữ liệu của chúng tôi.",
                    },
                    {
                        sub: "5.2 Chỉnh sửa",
                        body: "Bạn có quyền sửa dữ liệu cá nhân không chính xác hoặc không đầy đủ. Các trường hồ sơ tài khoản có thể được cập nhật trực tiếp trong bảng điều khiển. Đối với dữ liệu nhúng trong các bản ghi không thể thay đổi (ví dụ: nhật ký giao dịch), chúng tôi sẽ ghi chú sự chỉnh sửa trong siêu dữ liệu liên quan.",
                    },
                    {
                        sub: "5.3 Xóa ('Quyền được Lãng quên')",
                        body: "Bạn có thể yêu cầu xóa dữ liệu cá nhân khi dữ liệu không còn cần thiết cho các mục đích thu thập, khi bạn rút lại sự đồng ý hoặc khi bạn phản đối việc xử lý và không có căn cứ hợp pháp nào cho việc tiếp tục xử lý. Một số dữ liệu nhất định có thể được giữ lại để đáp ứng nghĩa vụ pháp lý.",
                    },
                    {
                        sub: "5.4 Hạn chế & Phản đối",
                        body: "Bạn có thể yêu cầu chúng tôi hạn chế xử lý dữ liệu trong khi giải quyết tranh chấp. Bạn có thể phản đối việc xử lý dựa trên lợi ích hợp pháp của chúng tôi. Khi bạn phản đối tiếp thị trực tiếp, chúng tôi sẽ luôn tôn trọng yêu cầu đó vô điều kiện.",
                    },
                    {
                        sub: "5.5 Khiếu nại",
                        body: "Nếu bạn cho rằng chúng tôi đã vi phạm luật bảo vệ dữ liệu hiện hành, bạn có quyền khiếu nại với cơ quan giám sát có liên quan. Tại Việt Nam, đây là Bộ Công An. Tại EU/EEA, cơ quan có thẩm quyền được xác định theo quốc gia cư trú của bạn.",
                    },
                ],
            },
            {
                id: "s6",
                title: "6. Cookie & Theo dõi",
                content: [
                    {
                        sub: "6.1 Cookie Cần thiết",
                        body: "Chúng tôi sử dụng cookie phiên để duy trì trạng thái xác thực của bạn (thông qua mã thông báo JWT NextAuth.js được lưu trữ dưới dạng cookie HTTP-only). Đây là những cookie cần thiết và không thể tắt mà không làm hỏng chức năng cốt lõi.",
                    },
                    {
                        sub: "6.2 Phân tích",
                        body: "Chúng tôi sử dụng Vercel Analytics để thu thập thống kê sử dụng tổng hợp, ẩn danh. Không có số định danh cá nhân nào được truyền đến Vercel Analytics. Bạn có thể từ chối bằng cách bật tiêu đề 'Do Not Track' trong trình duyệt.",
                    },
                    {
                        sub: "6.3 Không có Quảng cáo của Bên thứ Ba",
                        body: "Chúng tôi không sử dụng cookie quảng cáo, pixel theo dõi hoặc công nghệ nhắm mục tiêu lại của bên thứ ba. Chúng tôi không tham gia vào các mạng quảng cáo hành vi.",
                    },
                ],
            },
            {
                id: "s7",
                title: "7. Thay đổi Chính sách này",
                content: [
                    {
                        sub: "",
                        body: "Chúng tôi có thể cập nhật Chính sách Bảo mật này định kỳ. Các thay đổi quan trọng sẽ được thông báo qua email (đến địa chỉ trong tài khoản của bạn) và qua thông báo trong nền tảng ít nhất 14 ngày trước khi có hiệu lực. Việc tiếp tục sử dụng nền tảng sau ngày có hiệu lực cấu thành việc chấp nhận chính sách đã cập nhật. Các phiên bản trước sẽ được lưu trữ và cung cấp theo yêu cầu.",
                    },
                ],
            },
            {
                id: "s8",
                title: "8. Liên hệ & Cán bộ Bảo vệ Dữ liệu",
                content: [
                    {
                        sub: "",
                        body: "Đối với tất cả các yêu cầu liên quan đến quyền riêng tư, yêu cầu truy cập dữ liệu hoặc để thực hiện quyền của bạn, vui lòng liên hệ Cán bộ Bảo vệ Dữ liệu của chúng tôi tại: privacy@gatewaycentral.io. Chúng tôi sẽ trả lời tất cả các yêu cầu có thể xác minh trong vòng 30 ngày dương lịch. Đối với các vấn đề bảo mật khẩn cấp, vui lòng bao gồm 'KHẨN CẤP' trong dòng tiêu đề.",
                    },
                ],
            },
        ],
    },
}

export default function PrivacyPage() {
    const [lang, setLang] = useState<Lang>("en")
    const [activeSection, setActiveSection] = useState("s1")
    const wrapperRef = useRef<HTMLDivElement>(null)

    const t = CONTENT[lang]

    const switchLang = useCallback((next: Lang) => {
        const el = wrapperRef.current
        if (!el) { setLang(next); return }
        el.classList.add("lang-switching")
        setTimeout(() => {
            setLang(next)
            el.classList.remove("lang-switching")
        }, 120)
    }, [])

    const scrollTo = (id: string) => {
        setActiveSection(id)
        const el = document.getElementById(id)
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" })
    }

    return (
        <div
            ref={wrapperRef}
            className="min-h-screen bg-background text-foreground"
            data-lang={lang}
        >
            {/* ── Top Nav ──────────────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur-md">
                <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href="/"
                            className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            {t.back}
                        </Link>
                        <span className="text-border">|</span>
                        <div className="flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs font-mono font-semibold text-foreground">{t.title}</span>
                        </div>
                    </div>

                    {/* Language toggle */}
                    <button
                        onClick={() => switchLang(lang === "en" ? "vi" : "en")}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-secondary hover:bg-secondary/70 transition-colors text-xs font-mono text-muted-foreground hover:text-foreground"
                    >
                        <Globe className="w-3.5 h-3.5" />
                        {lang === "en" ? "VI" : "EN"}
                    </button>
                </div>
            </header>

            <div className="max-w-7xl mx-auto px-6 py-12">
                {/* ── Page Header ────────────────────────────────────────────────────── */}
                <div className="mb-12 pb-8 border-b border-border">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-mono mb-4">
                        <Shield className="w-3 h-3" />
                        {t.badge}
                    </div>
                    <h1 className="font-sans text-4xl font-bold text-foreground text-balance mb-2">{t.title}</h1>
                    <p className="font-sans text-muted-foreground text-sm mb-3">{t.subtitle}</p>
                    <p className="font-mono text-xs text-muted-foreground/70">{t.updated}</p>
                    <p className="font-sans text-sm text-muted-foreground leading-relaxed mt-4 max-w-3xl prose-text">
                        {t.intro}
                    </p>
                </div>

                <div className="flex gap-10">
                    {/* ── Table of Contents (sticky sidebar) ─────────────────────────── */}
                    <aside className="hidden lg:block w-56 shrink-0">
                        <div className="sticky top-24">
                            <p className="text-xs font-mono font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                                {t.toc_title}
                            </p>
                            <nav className="flex flex-col gap-1">
                                {t.sections.map((s) => (
                                    <button
                                        key={s.id}
                                        onClick={() => scrollTo(s.id)}
                                        className={`flex items-start gap-2 text-left text-xs font-sans leading-relaxed py-1.5 px-2 rounded transition-colors ${activeSection === s.id
                                                ? "text-primary bg-primary/10"
                                                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                                            }`}
                                    >
                                        {activeSection === s.id && (
                                            <ChevronRight className="w-3 h-3 mt-0.5 shrink-0 text-primary" />
                                        )}
                                        <span className={activeSection === s.id ? "ml-0" : "ml-5"}>{s.title}</span>
                                    </button>
                                ))}
                            </nav>
                        </div>
                    </aside>

                    {/* ── Main Content ───────────────────────────────────────────────── */}
                    <main className="flex-1 min-w-0">
                        <div className="flex flex-col gap-10">
                            {t.sections.map((section) => (
                                <section
                                    key={section.id}
                                    id={section.id}
                                    className="scroll-mt-24"
                                    onMouseEnter={() => setActiveSection(section.id)}
                                >
                                    <h2 className="font-sans text-lg font-semibold text-foreground mb-5 pb-2 border-b border-border">
                                        {section.title}
                                    </h2>
                                    <div className="flex flex-col gap-5">
                                        {section.content.map((block, i) => (
                                            <div key={i} className="rounded-lg border border-border bg-card p-5">
                                                {block.sub && (
                                                    <h3 className="font-mono text-xs font-semibold text-primary mb-2">
                                                        {block.sub}
                                                    </h3>
                                                )}
                                                <p className="font-sans text-sm text-muted-foreground leading-relaxed prose-text">
                                                    {block.body}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>

                        {/* Footer nav */}
                        <div className="mt-16 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
                            <Link
                                href="/"
                                className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                {t.back}
                            </Link>
                            <Link
                                href="/terms"
                                className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
                            >
                                {lang === "en" ? "Terms of Use" : "Điều khoản Sử dụng"}
                                <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    )
}
