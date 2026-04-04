"use client"

import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import { FileText, Globe, ArrowLeft, ChevronRight } from "lucide-react"

type Lang = "en" | "vi"

// ─── Content ───────────────────────────────────────────────────────────────────
const CONTENT = {
    en: {
        back: "Back to Home",
        badge: "Legal Document",
        title: "Terms of Use",
        subtitle: "Gateway Central — Payment Infrastructure Platform",
        updated: "Last updated: April 4, 2026 · Effective: April 4, 2026",
        intro:
            "These Terms of Use ('Terms') constitute a legally binding agreement between you ('Merchant', 'User', or 'you') and Gateway Central ('Company', 'we', 'our'). By accessing or using our platform, API, or related services, you confirm that you have read, understood, and agree to be bound by these Terms. If you do not agree, you must not access or use our services.",
        toc_title: "Table of Contents",
        sections: [
            {
                id: "t1",
                title: "1. Definitions",
                content: [
                    {
                        sub: "",
                        body: "'Platform' means the Gateway Central web application, API endpoints, and all associated software. 'Services' means the payment routing, merchant account rotation, transaction management, and related features provided through the Platform. 'Merchant Account' means a PayPal account registered by you and added to the Platform for transaction routing. 'API Key' means the authentication credential issued to your store. 'Transaction' means any payment initiated through the Platform on your behalf.",
                    },
                ],
            },
            {
                id: "t2",
                title: "2. Eligibility & Account Registration",
                content: [
                    {
                        sub: "2.1 Eligibility",
                        body: "You must be at least 18 years of age and have full legal capacity to enter into a binding contract. You must be duly authorized to operate the business entity you represent. Access to the Platform is limited to merchants engaged in lawful commercial activities.",
                    },
                    {
                        sub: "2.2 Account Accuracy",
                        body: "You agree to provide accurate, current, and complete information during registration and to update such information promptly when it changes. You are responsible for maintaining the confidentiality of your login credentials. You must notify us immediately at security@gatewaycentral.io if you suspect unauthorized access to your account.",
                    },
                    {
                        sub: "2.3 One Account Per Entity",
                        body: "Each legal entity may maintain only one primary merchant account. Creating multiple accounts to circumvent volume limits, restrictions, or fees is strictly prohibited and will result in immediate termination of all associated accounts.",
                    },
                ],
            },
            {
                id: "t3",
                title: "3. Acceptable Use",
                content: [
                    {
                        sub: "3.1 Permitted Activities",
                        body: "You may use the Platform solely to route legitimate payment transactions for goods and services sold through your registered e-commerce store. You must comply with all applicable local, national, and international laws, including those governing e-commerce, consumer protection, and financial services.",
                    },
                    {
                        sub: "3.2 Prohibited Activities",
                        body: "You must not use the Platform for: (a) fraudulent, deceptive, or illegal transactions; (b) money laundering, terrorist financing, or sanctions evasion; (c) processing payments for prohibited goods or services including but not limited to weapons, controlled substances, counterfeit goods, adult content without age verification, or gambling where prohibited; (d) deliberate chargebacks or dispute abuse; (e) transactions that violate PayPal's Acceptable Use Policy; (f) unauthorized access to third-party accounts.",
                    },
                    {
                        sub: "3.3 Item Masking Compliance",
                        body: "The item masking feature is provided solely to protect commercially sensitive product information from exposure in payment processor records. You must not use item masking to disguise the true nature of prohibited transactions. Misuse of item masking to facilitate fraud constitutes a material breach of these Terms.",
                    },
                    {
                        sub: "3.4 API Usage",
                        body: "You may integrate our API only for your own stores. You must not resell, sublicense, or otherwise grant third parties access to your API credentials or the Platform through your account. Rate limiting applies and circumventing rate limits is prohibited.",
                    },
                ],
            },
            {
                id: "t4",
                title: "4. Merchant Account Obligations",
                content: [
                    {
                        sub: "4.1 Account Legitimacy",
                        body: "You warrant that all PayPal merchant accounts registered on the Platform are legitimately owned by you or your business entity and were created in full compliance with PayPal's Terms of Service. You are solely responsible for maintaining those accounts in good standing.",
                    },
                    {
                        sub: "4.2 Volume & Limits",
                        body: "Daily transaction limits are set per merchant account. You acknowledge that exceeding these limits may result in PayPal imposing restrictions. The Platform's rotation engine manages volume distribution, but you remain responsible for ensuring your total processing activity complies with PayPal's policies.",
                    },
                    {
                        sub: "4.3 Credential Security",
                        body: "You are responsible for keeping your PayPal API credentials secure. You must not share credentials with unauthorized personnel. If credentials are compromised, you must update them immediately in the Platform and notify us. We will encrypt your credentials at rest but cannot guarantee security if you disclose them externally.",
                    },
                ],
            },
            {
                id: "t5",
                title: "5. Fees & Billing",
                content: [
                    {
                        sub: "5.1 Gateway Fee",
                        body: "A gateway fee of 2% (or as otherwise specified in your service agreement) is applied to the net transaction amount for each successfully completed payment. This fee covers platform operation, API infrastructure, and support services. The fee is calculated and deducted automatically from transaction proceeds.",
                    },
                    {
                        sub: "5.2 No Refund of Gateway Fees",
                        body: "Gateway fees are non-refundable once a transaction has been processed, regardless of subsequent chargebacks, disputes, or customer refunds. You remain liable for gateway fees on transactions that are later reversed.",
                    },
                    {
                        sub: "5.3 Changes to Fees",
                        body: "We reserve the right to modify our fee structure with 30 days' written notice. Continued use of the Platform after the notice period constitutes acceptance of the new fee schedule.",
                    },
                ],
            },
            {
                id: "t6",
                title: "6. Intellectual Property",
                content: [
                    {
                        sub: "6.1 Platform Ownership",
                        body: "All rights, title, and interest in and to the Platform, including all software, algorithms, user interfaces, trademarks, trade secrets, and documentation, are and remain the exclusive property of Gateway Central. Nothing in these Terms grants you any ownership rights in the Platform.",
                    },
                    {
                        sub: "6.2 License Grant",
                        body: "Subject to your compliance with these Terms, we grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Platform solely for your own business purposes. This license does not include the right to copy, modify, distribute, reverse engineer, or create derivative works of the Platform.",
                    },
                    {
                        sub: "6.3 Your Data",
                        body: "You retain all ownership rights to your transaction data and business information. By uploading data to the Platform, you grant us a limited license to process and store that data solely for the purpose of providing the Services. We do not acquire any ownership interest in your data.",
                    },
                ],
            },
            {
                id: "t7",
                title: "7. Disclaimers & Limitation of Liability",
                content: [
                    {
                        sub: "7.1 'As Is' Service",
                        body: "The Platform is provided on an 'as is' and 'as available' basis without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Platform will be uninterrupted, error-free, or secure.",
                    },
                    {
                        sub: "7.2 Limitation of Liability",
                        body: "To the maximum extent permitted by applicable law, Gateway Central shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to loss of profits, revenue, data, or business opportunities, arising out of or related to your use of the Platform, even if we have been advised of the possibility of such damages.",
                    },
                    {
                        sub: "7.3 Cap on Liability",
                        body: "Our total cumulative liability to you for any claims arising out of or relating to these Terms or the Services shall not exceed the total gateway fees paid by you in the three (3) calendar months immediately preceding the event giving rise to the claim.",
                    },
                    {
                        sub: "7.4 PayPal Relationship",
                        body: "We are an independent technology provider and are not affiliated with, endorsed by, or acting as an agent of PayPal Inc. We are not responsible for PayPal's decisions to limit, suspend, or terminate your PayPal account. You must independently comply with all PayPal terms and policies.",
                    },
                ],
            },
            {
                id: "t8",
                title: "8. Indemnification",
                content: [
                    {
                        sub: "",
                        body: "You agree to indemnify, defend, and hold harmless Gateway Central, its officers, directors, employees, agents, licensors, and service providers from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable attorneys' fees) arising out of or relating to: (a) your violation of these Terms; (b) your use of the Platform; (c) your violation of any third-party right, including intellectual property, privacy, or payment processor rights; (d) any fraudulent or illegal transactions processed through your account; or (e) your breach of applicable law.",
                    },
                ],
            },
            {
                id: "t9",
                title: "9. Termination",
                content: [
                    {
                        sub: "9.1 Termination by You",
                        body: "You may terminate your account at any time by providing 30 days' written notice to support@gatewaycentral.io. All outstanding fees become immediately due upon notice of termination.",
                    },
                    {
                        sub: "9.2 Termination by Us",
                        body: "We may suspend or terminate your access immediately and without notice if: (a) you breach any material term of these Terms; (b) we reasonably suspect fraudulent or illegal activity; (c) we are required to do so by law or regulatory authority; (d) your PayPal accounts are suspended or terminated by PayPal; or (e) continued service poses a risk to the Platform or other users.",
                    },
                    {
                        sub: "9.3 Effect of Termination",
                        body: "Upon termination: your API access will be revoked, your data will be retained for the period specified in the Privacy Policy, outstanding gateway fees remain payable, and Sections 6, 7, 8, and 10 will survive termination indefinitely.",
                    },
                ],
            },
            {
                id: "t10",
                title: "10. Governing Law & Dispute Resolution",
                content: [
                    {
                        sub: "10.1 Governing Law",
                        body: "These Terms shall be governed by and construed in accordance with the laws applicable to the jurisdiction in which Gateway Central is registered, without regard to conflict of law principles.",
                    },
                    {
                        sub: "10.2 Dispute Resolution",
                        body: "Any dispute, controversy, or claim arising out of or relating to these Terms or the Services shall first be subject to good-faith negotiation for a period of 30 days. If unresolved, disputes shall be submitted to binding arbitration under rules agreed upon by both parties. Class actions are waived.",
                    },
                    {
                        sub: "10.3 Changes to Terms",
                        body: "We may modify these Terms at any time. Material changes will be communicated with at least 14 days' advance notice. Continued use after the effective date constitutes acceptance.",
                    },
                ],
            },
        ],
    },

    vi: {
        back: "Quay về Trang chủ",
        badge: "Tài liệu Pháp lý",
        title: "Điều khoản Sử dụng",
        subtitle: "Gateway Central — Nền tảng Hạ tầng Thanh toán",
        updated: "Cập nhật lần cuối: 04 tháng 04, 2026 · Có hiệu lực: 04 tháng 04, 2026",
        intro:
            "Điều khoản Sử dụng này ('Điều khoản') cấu thành một thỏa thuận ràng buộc pháp lý giữa bạn ('Merchant', 'Người dùng', hoặc 'bạn') và Gateway Central ('Công ty', 'chúng tôi', 'của chúng tôi'). Bằng cách truy cập hoặc sử dụng nền tảng, API hoặc các dịch vụ liên quan của chúng tôi, bạn xác nhận rằng bạn đã đọc, hiểu và đồng ý bị ràng buộc bởi các Điều khoản này. Nếu bạn không đồng ý, bạn không được phép truy cập hoặc sử dụng dịch vụ của chúng tôi.",
        toc_title: "Mục lục",
        sections: [
            {
                id: "t1",
                title: "1. Định nghĩa",
                content: [
                    {
                        sub: "",
                        body: "'Nền tảng' có nghĩa là ứng dụng web Gateway Central, các điểm cuối API và tất cả phần mềm liên quan. 'Dịch vụ' có nghĩa là định tuyến thanh toán, xoay vòng tài khoản merchant, quản lý giao dịch và các tính năng liên quan được cung cấp qua Nền tảng. 'Tài khoản Merchant' có nghĩa là tài khoản PayPal do bạn đăng ký và thêm vào Nền tảng để định tuyến giao dịch. 'Khóa API' có nghĩa là thông tin xác thực được cấp cho cửa hàng của bạn. 'Giao dịch' có nghĩa là bất kỳ khoản thanh toán nào được khởi tạo qua Nền tảng thay mặt cho bạn.",
                    },
                ],
            },
            {
                id: "t2",
                title: "2. Điều kiện Đủ tư cách & Đăng ký Tài khoản",
                content: [
                    {
                        sub: "2.1 Điều kiện Đủ tư cách",
                        body: "Bạn phải ít nhất 18 tuổi và có đủ năng lực pháp lý để tham gia hợp đồng ràng buộc. Bạn phải được ủy quyền hợp lệ để điều hành tổ chức kinh doanh mà bạn đại diện. Quyền truy cập vào Nền tảng chỉ dành cho các merchant tham gia vào các hoạt động thương mại hợp pháp.",
                    },
                    {
                        sub: "2.2 Tính Chính xác của Tài khoản",
                        body: "Bạn đồng ý cung cấp thông tin chính xác, hiện tại và đầy đủ trong quá trình đăng ký và cập nhật thông tin đó kịp thời khi có thay đổi. Bạn có trách nhiệm bảo mật thông tin đăng nhập của mình. Bạn phải thông báo ngay cho chúng tôi tại security@gatewaycentral.io nếu bạn nghi ngờ có truy cập trái phép vào tài khoản của mình.",
                    },
                    {
                        sub: "2.3 Một Tài khoản cho Mỗi Tổ chức",
                        body: "Mỗi pháp nhân chỉ được duy trì một tài khoản merchant chính. Việc tạo nhiều tài khoản để vượt qua giới hạn khối lượng, hạn chế hoặc phí bị nghiêm cấm và sẽ dẫn đến chấm dứt ngay lập tức tất cả các tài khoản liên quan.",
                    },
                ],
            },
            {
                id: "t3",
                title: "3. Sử dụng Được chấp nhận",
                content: [
                    {
                        sub: "3.1 Hoạt động Được phép",
                        body: "Bạn chỉ có thể sử dụng Nền tảng để định tuyến các giao dịch thanh toán hợp pháp cho hàng hóa và dịch vụ được bán qua cửa hàng thương mại điện tử đã đăng ký của bạn. Bạn phải tuân thủ tất cả các luật địa phương, quốc gia và quốc tế hiện hành, bao gồm các luật điều chỉnh thương mại điện tử, bảo vệ người tiêu dùng và dịch vụ tài chính.",
                    },
                    {
                        sub: "3.2 Hoạt động Bị cấm",
                        body: "Bạn không được sử dụng Nền tảng cho: (a) các giao dịch gian lận, lừa đảo hoặc bất hợp pháp; (b) rửa tiền, tài trợ khủng bố hoặc né tránh lệnh trừng phạt; (c) xử lý thanh toán cho hàng hóa hoặc dịch vụ bị cấm bao gồm nhưng không giới hạn ở vũ khí, chất có kiểm soát, hàng giả, nội dung người lớn không có xác minh tuổi, hoặc cờ bạc ở nơi bị cấm; (d) hoàn tiền có chủ đích hoặc lạm dụng tranh chấp; (e) các giao dịch vi phạm Chính sách Sử dụng Chấp nhận của PayPal; (f) truy cập trái phép vào tài khoản của bên thứ ba.",
                    },
                    {
                        sub: "3.3 Tuân thủ Che giấu Sản phẩm",
                        body: "Tính năng che giấu sản phẩm chỉ được cung cấp để bảo vệ thông tin sản phẩm thương mại nhạy cảm khỏi bị tiết lộ trong hồ sơ của bộ xử lý thanh toán. Bạn không được sử dụng tính năng che giấu sản phẩm để che giấu bản chất thực sự của các giao dịch bị cấm. Việc lạm dụng tính năng che giấu sản phẩm để tạo điều kiện cho gian lận cấu thành vi phạm trọng yếu các Điều khoản này.",
                    },
                    {
                        sub: "3.4 Sử dụng API",
                        body: "Bạn chỉ có thể tích hợp API của chúng tôi cho các cửa hàng của riêng bạn. Bạn không được bán lại, cấp phép phụ hoặc cấp cho bên thứ ba quyền truy cập vào thông tin xác thực API hoặc Nền tảng thông qua tài khoản của bạn. Giới hạn tốc độ áp dụng và việc vượt qua giới hạn tốc độ bị cấm.",
                    },
                ],
            },
            {
                id: "t4",
                title: "4. Nghĩa vụ Tài khoản Merchant",
                content: [
                    {
                        sub: "4.1 Tính Hợp pháp của Tài khoản",
                        body: "Bạn đảm bảo rằng tất cả tài khoản merchant PayPal được đăng ký trên Nền tảng được bạn hoặc tổ chức kinh doanh của bạn sở hữu hợp pháp và được tạo ra tuân thủ đầy đủ Điều khoản Dịch vụ của PayPal. Bạn hoàn toàn chịu trách nhiệm duy trì các tài khoản đó trong tình trạng tốt.",
                    },
                    {
                        sub: "4.2 Khối lượng & Giới hạn",
                        body: "Giới hạn giao dịch hàng ngày được đặt cho mỗi tài khoản merchant. Bạn thừa nhận rằng việc vượt quá những giới hạn này có thể khiến PayPal áp đặt hạn chế. Công cụ xoay vòng của Nền tảng quản lý phân phối khối lượng, nhưng bạn vẫn chịu trách nhiệm đảm bảo tổng hoạt động xử lý của bạn tuân thủ các chính sách của PayPal.",
                    },
                    {
                        sub: "4.3 Bảo mật Thông tin xác thực",
                        body: "Bạn có trách nhiệm giữ an toàn thông tin xác thực API PayPal của mình. Bạn không được chia sẻ thông tin xác thực với nhân viên không được ủy quyền. Nếu thông tin xác thực bị xâm phạm, bạn phải cập nhật ngay trong Nền tảng và thông báo cho chúng tôi. Chúng tôi sẽ mã hóa thông tin xác thực của bạn khi lưu trữ nhưng không thể đảm bảo bảo mật nếu bạn tiết lộ chúng ra bên ngoài.",
                    },
                ],
            },
            {
                id: "t5",
                title: "5. Phí & Thanh toán",
                content: [
                    {
                        sub: "5.1 Phí Cổng Thanh toán",
                        body: "Phí cổng thanh toán 2% (hoặc như được quy định trong thỏa thuận dịch vụ của bạn) được áp dụng cho số tiền giao dịch thuần cho mỗi khoản thanh toán đã hoàn thành. Phí này bao gồm vận hành nền tảng, hạ tầng API và dịch vụ hỗ trợ. Phí được tính và khấu trừ tự động từ tiền thu từ giao dịch.",
                    },
                    {
                        sub: "5.2 Không Hoàn lại Phí Cổng Thanh toán",
                        body: "Phí cổng thanh toán không được hoàn lại sau khi giao dịch đã được xử lý, bất kể các hoàn tiền, tranh chấp hoặc hoàn tiền cho khách hàng sau đó. Bạn vẫn có nghĩa vụ thanh toán phí cổng thanh toán đối với các giao dịch sau đó bị hoàn trả.",
                    },
                    {
                        sub: "5.3 Thay đổi Phí",
                        body: "Chúng tôi bảo lưu quyền sửa đổi cơ cấu phí với thông báo 30 ngày bằng văn bản. Việc tiếp tục sử dụng Nền tảng sau thời gian thông báo cấu thành việc chấp nhận biểu phí mới.",
                    },
                ],
            },
            {
                id: "t6",
                title: "6. Sở hữu Trí tuệ",
                content: [
                    {
                        sub: "6.1 Quyền Sở hữu Nền tảng",
                        body: "Tất cả các quyền, danh hiệu và lợi ích đối với Nền tảng, bao gồm tất cả phần mềm, thuật toán, giao diện người dùng, nhãn hiệu, bí mật thương mại và tài liệu hướng dẫn, là và vẫn là tài sản độc quyền của Gateway Central. Không có gì trong các Điều khoản này cấp cho bạn bất kỳ quyền sở hữu nào đối với Nền tảng.",
                    },
                    {
                        sub: "6.2 Cấp phép",
                        body: "Tùy thuộc vào việc bạn tuân thủ các Điều khoản này, chúng tôi cấp cho bạn giấy phép có giới hạn, không độc quyền, không thể chuyển nhượng, có thể thu hồi để truy cập và sử dụng Nền tảng chỉ cho mục đích kinh doanh của riêng bạn. Giấy phép này không bao gồm quyền sao chép, sửa đổi, phân phối, dịch ngược hoặc tạo ra các tác phẩm phái sinh của Nền tảng.",
                    },
                    {
                        sub: "6.3 Dữ liệu của Bạn",
                        body: "Bạn giữ lại tất cả quyền sở hữu đối với dữ liệu giao dịch và thông tin kinh doanh của mình. Bằng cách tải dữ liệu lên Nền tảng, bạn cấp cho chúng tôi giấy phép có giới hạn để xử lý và lưu trữ dữ liệu đó chỉ nhằm mục đích cung cấp Dịch vụ. Chúng tôi không có bất kỳ quyền sở hữu nào đối với dữ liệu của bạn.",
                    },
                ],
            },
            {
                id: "t7",
                title: "7. Tuyên bố Miễn trừ & Giới hạn Trách nhiệm",
                content: [
                    {
                        sub: "7.1 Dịch vụ 'Nguyên trạng'",
                        body: "Nền tảng được cung cấp trên cơ sở 'nguyên trạng' và 'khi có sẵn' mà không có bảo đảm dưới bất kỳ hình thức nào, dù rõ ràng hay ngụ ý, bao gồm nhưng không giới hạn ở các bảo đảm về khả năng bán được, phù hợp cho mục đích cụ thể hoặc không vi phạm. Chúng tôi không đảm bảo rằng Nền tảng sẽ không bị gián đoạn, không có lỗi hoặc an toàn.",
                    },
                    {
                        sub: "7.2 Giới hạn Trách nhiệm",
                        body: "Đến mức tối đa được pháp luật hiện hành cho phép, Gateway Central sẽ không chịu trách nhiệm về bất kỳ thiệt hại gián tiếp, ngẫu nhiên, đặc biệt, hậu quả hoặc trừng phạt nào, bao gồm nhưng không giới hạn ở mất lợi nhuận, doanh thu, dữ liệu hoặc cơ hội kinh doanh, phát sinh từ hoặc liên quan đến việc bạn sử dụng Nền tảng, ngay cả khi chúng tôi đã được thông báo về khả năng xảy ra những thiệt hại đó.",
                    },
                    {
                        sub: "7.3 Giới hạn Trách nhiệm Tổng hợp",
                        body: "Tổng trách nhiệm lũy kế của chúng tôi đối với bạn cho bất kỳ khiếu nại nào phát sinh từ hoặc liên quan đến các Điều khoản này hoặc Dịch vụ sẽ không vượt quá tổng phí cổng thanh toán bạn đã trả trong ba (3) tháng dương lịch ngay trước sự kiện làm phát sinh khiếu nại.",
                    },
                    {
                        sub: "7.4 Mối quan hệ với PayPal",
                        body: "Chúng tôi là nhà cung cấp công nghệ độc lập và không liên kết, được chứng thực bởi hoặc hoạt động như đại lý của PayPal Inc. Chúng tôi không chịu trách nhiệm về các quyết định của PayPal trong việc giới hạn, tạm dừng hoặc chấm dứt tài khoản PayPal của bạn. Bạn phải độc lập tuân thủ tất cả các điều khoản và chính sách của PayPal.",
                    },
                ],
            },
            {
                id: "t8",
                title: "8. Bồi thường",
                content: [
                    {
                        sub: "",
                        body: "Bạn đồng ý bồi thường, bảo vệ và giữ an toàn cho Gateway Central, các cán bộ, giám đốc, nhân viên, đại lý, người cấp phép và nhà cung cấp dịch vụ của công ty khỏi và chống lại bất kỳ khiếu nại, trách nhiệm, thiệt hại, phán quyết, giải thưởng, tổn thất, chi phí, phí tổn hoặc chi phí (bao gồm phí luật sư hợp lý) phát sinh từ hoặc liên quan đến: (a) vi phạm các Điều khoản này của bạn; (b) việc sử dụng Nền tảng của bạn; (c) vi phạm bất kỳ quyền nào của bên thứ ba, bao gồm quyền sở hữu trí tuệ, quyền riêng tư hoặc quyền của bộ xử lý thanh toán; (d) bất kỳ giao dịch gian lận hoặc bất hợp pháp nào được xử lý qua tài khoản của bạn; hoặc (e) vi phạm luật hiện hành của bạn.",
                    },
                ],
            },
            {
                id: "t9",
                title: "9. Chấm dứt",
                content: [
                    {
                        sub: "9.1 Chấm dứt bởi Bạn",
                        body: "Bạn có thể chấm dứt tài khoản của mình bất kỳ lúc nào bằng cách cung cấp thông báo 30 ngày bằng văn bản cho support@gatewaycentral.io. Tất cả các khoản phí còn nợ sẽ đến hạn ngay lập tức khi có thông báo chấm dứt.",
                    },
                    {
                        sub: "9.2 Chấm dứt bởi Chúng tôi",
                        body: "Chúng tôi có thể tạm dừng hoặc chấm dứt quyền truy cập của bạn ngay lập tức và không cần thông báo nếu: (a) bạn vi phạm bất kỳ điều khoản quan trọng nào của các Điều khoản này; (b) chúng tôi có lý do hợp lý để nghi ngờ hoạt động gian lận hoặc bất hợp pháp; (c) chúng tôi được yêu cầu làm vậy bởi luật hoặc cơ quan quản lý; (d) tài khoản PayPal của bạn bị PayPal tạm dừng hoặc chấm dứt; hoặc (e) việc tiếp tục cung cấp dịch vụ gây rủi ro cho Nền tảng hoặc người dùng khác.",
                    },
                    {
                        sub: "9.3 Hậu quả của Chấm dứt",
                        body: "Khi chấm dứt: quyền truy cập API của bạn sẽ bị thu hồi, dữ liệu của bạn sẽ được giữ lại trong thời gian được quy định trong Chính sách Bảo mật, phí cổng thanh toán còn nợ vẫn phải trả, và Mục 6, 7, 8 và 10 sẽ tồn tại sau khi chấm dứt vô thời hạn.",
                    },
                ],
            },
            {
                id: "t10",
                title: "10. Luật Điều chỉnh & Giải quyết Tranh chấp",
                content: [
                    {
                        sub: "10.1 Luật Điều chỉnh",
                        body: "Các Điều khoản này sẽ được điều chỉnh và giải thích theo pháp luật áp dụng tại khu vực tài phán nơi Gateway Central được đăng ký, không tính đến các nguyên tắc xung đột pháp luật.",
                    },
                    {
                        sub: "10.2 Giải quyết Tranh chấp",
                        body: "Bất kỳ tranh chấp, mâu thuẫn hoặc khiếu nại nào phát sinh từ hoặc liên quan đến các Điều khoản này hoặc Dịch vụ trước tiên phải chịu sự đàm phán thiện chí trong vòng 30 ngày. Nếu không được giải quyết, tranh chấp sẽ được đưa ra trọng tài ràng buộc theo các quy tắc được cả hai bên thỏa thuận. Các vụ kiện tập thể được miễn trừ.",
                    },
                    {
                        sub: "10.3 Thay đổi Điều khoản",
                        body: "Chúng tôi có thể sửa đổi các Điều khoản này bất kỳ lúc nào. Các thay đổi quan trọng sẽ được thông báo ít nhất 14 ngày trước. Việc tiếp tục sử dụng sau ngày có hiệu lực cấu thành việc chấp nhận.",
                    },
                ],
            },
        ],
    },
}

export default function TermsPage() {
    const [lang, setLang] = useState<Lang>("en")
    const [activeSection, setActiveSection] = useState("t1")
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
                            <FileText className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs font-mono font-semibold text-foreground">{t.title}</span>
                        </div>
                    </div>

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
                        <FileText className="w-3 h-3" />
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
                    {/* ── Table of Contents ──────────────────────────────────────────── */}
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
                                href="/privacy"
                                className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
                            >
                                {lang === "en" ? "Privacy Policy" : "Chính sách Bảo mật"}
                                <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                        </div>
                    </main>
                </div>
            </div>
        </div>
    )
}
