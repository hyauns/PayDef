"use client"

import { DashboardShell } from "@/components/dashboard/DashboardShell"
import { DashboardPageHeader } from "@/components/dashboard/DashboardPageHeader"

export default function DocumentsPage() {
  return (
    <DashboardShell>
      <main 
        className="px-4 md:px-8 py-8 w-full max-w-7xl mx-auto space-y-8"
        data-ui-version="documents-page-v1"
      >
        <DashboardPageHeader 
          eyebrow="INTERNAL GUIDES"
          title="Documents"
          description="Internal guides for understanding PayDef, payment operations, and gateway management."
        />

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Navigation Sidebar */}
          <div className="w-full lg:w-[250px] shrink-0 bg-[#222530] border border-[#343947] rounded-xl p-4 sticky top-6">
            <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3] mb-4">Table of Contents</h3>
            <nav className="space-y-1">
              <a href="#part-1" className="block px-3 py-2 text-sm text-[#FFD600] bg-[#FFD600]/10 rounded-md font-medium transition-colors">
                Part 1 — What is PayDef?
              </a>
              <a href="#part-2" className="block px-3 py-2 text-sm text-[#e7edf8] hover:text-[#FFD600] hover:bg-[#FFD600]/10 rounded-md font-medium transition-colors">
                Part 2 — Why merchants use PayDef
              </a>
              <a href="#part-3" className="block px-3 py-2 text-sm text-[#e7edf8] hover:text-[#FFD600] hover:bg-[#FFD600]/10 rounded-md font-medium transition-colors">
                Part 3 — Core Concepts
              </a>
              <a href="#part-4" className="block px-3 py-2 text-sm text-[#e7edf8] hover:text-[#FFD600] hover:bg-[#FFD600]/10 rounded-md font-medium transition-colors">
                Part 4 — Payment Display Profile
              </a>
              <a href="#part-5" className="block px-3 py-2 text-sm text-[#e7edf8] hover:text-[#FFD600] hover:bg-[#FFD600]/10 rounded-md font-medium transition-colors">
                Part 5 — Payment Identity Bundle
              </a>
            </nav>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0 space-y-8">
            <section id="part-1" className="bg-[#222530] border border-[#343947] border-b-[3px] border-b-[#2a2e3b] shadow-[0_8px_24px_rgba(0,0,0,0.2)] rounded-xl overflow-hidden">
              <div className="px-6 py-5 border-b border-[#343947] bg-[#1f222c]">
                <h2 className="text-xl font-semibold text-[#e7edf8]">Part 1 — What is PayDef?</h2>
              </div>
              
              <div className="p-6 space-y-8">
                {/* Vietnamese Section */}
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#2a2d39] border border-[#343947] text-sm font-medium text-[#b6c2d3]">
                    <span className="w-2 h-2 rounded-full bg-red-400"></span>
                    Vietnamese
                  </div>
                  <div className="text-[#e7edf8] leading-relaxed space-y-4 text-[15px]">
                    <p>
                      PayDef là một nền tảng quản lý cổng thanh toán và vận hành thanh toán được thiết kế dành riêng cho các nhà bán hàng thương mại điện tử (e-commerce). Về cốt lõi, PayDef hỗ trợ quản lý các cửa hàng, tài khoản thanh toán, luồng thanh toán (checkout flows), đơn hàng PayPal, giao dịch, hoàn tiền (refunds), hủy tiền (voids), thu tiền (captures), webhooks, cũng như các thông tin thanh toán hiển thị cho người mua.
                    </p>
                    <p>
                      Bằng việc tập trung hóa các thành phần này, PayDef cung cấp cho đội ngũ nội bộ, người vận hành và nhà bán hàng khả năng giám sát rõ ràng hơn và quyền kiểm soát vận hành tốt hơn trên toàn bộ các luồng thanh toán. Nền tảng này hỗ trợ sử dụng Hồ sơ Hiển thị Thanh toán (Payment Display Profiles) và Gói Định danh Thanh toán (Payment Identity Bundles) nhằm đảm bảo các mô tả thanh toán, tài khoản người bán, domain bảo vệ (shield domains), thông tin hỗ trợ và các liên kết chính sách luôn nhất quán và chính xác.
                    </p>
                    <p>
                      Điều quan trọng cần lưu ý là PayDef không thay thế các quy tắc hoặc chính sách từ phía các nhà cung cấp dịch vụ thanh toán. Nền tảng không đảm bảo rằng mọi giao dịch đều sẽ được phê duyệt, cũng như không thể ngăn chặn mọi khiếu nại (dispute) hay loại bỏ hoàn toàn rủi ro thanh toán.
                    </p>
                    <p>
                      Thay vào đó, PayDef được thiết kế nhằm mục đích giảm thiểu sự nhầm lẫn trong quá trình vận hành, cải thiện tính liên tục của trải nghiệm thanh toán, và giúp cho các hoạt động thanh toán trở nên dễ dàng theo dõi, quản lý và khắc phục hơn khi có sự cố xảy ra.
                    </p>
                  </div>
                </div>

                <div className="h-px bg-[#343947] w-full my-6"></div>

                {/* English Section */}
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#2a2d39] border border-[#343947] text-sm font-medium text-[#b6c2d3]">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    English
                  </div>
                  <div className="text-[#e7edf8] leading-relaxed space-y-4 text-[15px]">
                    <p>
                      PayDef is a comprehensive payment operations and gateway management platform designed specifically for e-commerce merchants. At its core, PayDef helps manage stores, payment accounts, checkout flows, PayPal orders, transactions, refunds, voids, captures, webhooks, and the buyer-facing payment display.
                    </p>
                    <p>
                      By centralizing these elements, PayDef provides internal teams, operators, and merchants with better visibility and operational control across complex payment flows. The platform supports Payment Display Profiles and Payment Identity Bundles to ensure that payment descriptions, merchant accounts, shield domains, support contact information, and policy links remain consistent and properly aligned during checkout.
                    </p>
                    <p>
                      It is important to understand that PayDef does not replace the rules or compliance requirements of payment providers. It does not guarantee that every transaction will be approved, nor does it prevent every dispute or remove all payment risk.
                    </p>
                    <p>
                      Instead, PayDef is specifically designed to reduce operational confusion, improve checkout continuity, and make day-to-day payment operations significantly easier to monitor and recover.
                    </p>
                  </div>
                </div>
                
                <div className="h-px bg-[#343947] w-full my-6"></div>

                {/* Key Takeaways */}
                <div className="space-y-6 bg-[#1a1d24] border border-[#343947] p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-[#FFD600] flex items-center gap-2">
                    Key Takeaways
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Vietnamese Key Takeaways</h4>
                      <ul className="list-disc pl-5 text-[#97a3b6] space-y-2 text-sm leading-relaxed">
                        <li>PayDef là nền tảng quản lý cổng thanh toán và vận hành dành cho thương mại điện tử.</li>
                        <li>Hệ thống giúp quản lý toàn diện từ cửa hàng, tài khoản, giao dịch, webhooks, đến thông tin hiển thị cho người mua.</li>
                        <li>Sử dụng Payment Display Profiles và Identity Bundles để duy trì sự nhất quán cho các thông tin hỗ trợ và mô tả đơn hàng.</li>
                        <li>KHÔNG thay thế quy định của cổng thanh toán, KHÔNG đảm bảo duyệt 100% giao dịch, và KHÔNG xóa bỏ hoàn toàn rủi ro.</li>
                        <li>Mục tiêu chính là giảm nhầm lẫn vận hành, duy trì thanh toán liên tục và dễ dàng theo dõi/khắc phục hệ thống.</li>
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">English Key Takeaways</h4>
                      <ul className="list-disc pl-5 text-[#97a3b6] space-y-2 text-sm leading-relaxed">
                        <li>PayDef is a payment operations and gateway management platform for e-commerce merchants.</li>
                        <li>It manages stores, accounts, checkout flows, transactions, webhooks, and buyer-facing displays.</li>
                        <li>It uses Payment Display Profiles and Identity Bundles to maintain consistent descriptions, domains, and support links.</li>
                        <li>It DOES NOT replace provider rules, guarantee transaction approvals, or eliminate payment risk.</li>
                        <li>Its primary goal is to reduce operational confusion, improve checkout continuity, and streamline monitoring and recovery.</li>
                      </ul>
                    </div>
                  </div>
                </div>

              </div>
            </section>

            {/* Part 2 */}
            <section id="part-2" className="bg-[#222530] border border-[#343947] border-b-[3px] border-b-[#2a2e3b] shadow-[0_8px_24px_rgba(0,0,0,0.2)] rounded-xl overflow-hidden mt-8">
              <div className="px-6 py-5 border-b border-[#343947] bg-[#1f222c]">
                <h2 className="text-xl font-semibold text-[#e7edf8]">Part 2 — Why Merchants Use PayDef</h2>
              </div>
              
              <div className="p-6 space-y-8">
                {/* Vietnamese Section */}
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#2a2d39] border border-[#343947] text-sm font-medium text-[#b6c2d3]">
                    <span className="w-2 h-2 rounded-full bg-red-400"></span>
                    Vietnamese
                  </div>
                  <div className="text-[#e7edf8] leading-relaxed space-y-4 text-[15px]">
                    <p>
                      Các nhà bán hàng sử dụng PayDef để giải quyết những thách thức vận hành phức tạp khi quản lý nhiều cửa hàng thương mại điện tử, các tài khoản thanh toán khác nhau và việc duy trì trải nghiệm thanh toán nhất quán. Nếu không có một nền tảng tập trung, việc theo dõi giao dịch, xử lý hoàn tiền, và đảm bảo người mua nhìn thấy đúng thông tin cửa hàng trên các domain khác nhau có thể trở nên quá tải và dễ xảy ra sai sót.
                    </p>
                    <p>
                      PayDef tối ưu hóa các hoạt động này bằng cách cung cấp một bảng điều khiển duy nhất để giám sát toàn bộ hoạt động của cổng thanh toán. Nền tảng cho phép người bán định tuyến (route) luồng thanh toán một cách an toàn qua các domain bảo vệ (shield domains) được chỉ định, giúp giảm rủi ro gây bối rối cho khách hàng và bỏ trống giỏ hàng. Hơn nữa, các tính năng như Gói Định danh Thanh toán (Payment Identity Bundles) đảm bảo rằng bất kể tài khoản người bán (merchant account) nào đang được sử dụng ở hệ thống backend, người mua vẫn luôn nhìn thấy tên thương hiệu, mô tả sản phẩm và chính sách hỗ trợ đồng nhất.
                    </p>
                    <p>
                      Cuối cùng, các nhà bán hàng tin dùng PayDef không phải để lách các quy định của nhà cung cấp dịch vụ, mà để đạt được sự minh bạch trong vận hành, duy trì trải nghiệm mua hàng chất lượng cao và phản hồi nhanh chóng trước các sự kiện thanh toán hoặc cảnh báo webhook trên toàn bộ hệ thống thương mại điện tử của họ.
                    </p>
                  </div>
                </div>

                <div className="h-px bg-[#343947] w-full my-6"></div>

                {/* English Section */}
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#2a2d39] border border-[#343947] text-sm font-medium text-[#b6c2d3]">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    English
                  </div>
                  <div className="text-[#e7edf8] leading-relaxed space-y-4 text-[15px]">
                    <p>
                      Merchants use PayDef to solve the complex operational challenges of running multiple e-commerce stores, managing various payment accounts, and maintaining consistent checkout experiences. Without a centralized platform, tracking transactions, handling refunds, and ensuring that buyers see the correct storefront information across different domains can become overwhelming and error-prone.
                    </p>
                    <p>
                      PayDef streamlines these operations by providing a single dashboard to monitor all gateway activities. It allows merchants to securely route checkout flows across designated shield domains, reducing the risk of customer confusion and cart abandonment. Furthermore, features like Payment Identity Bundles ensure that regardless of the backend merchant account being used, the buyer always sees a consistent brand name, semantic product description, and support policy.
                    </p>
                    <p>
                      Ultimately, merchants rely on PayDef not to bypass provider rules, but to achieve operational clarity, maintain high-quality buyer experiences, and respond quickly to payment events or webhook alerts across their entire e-commerce network.
                    </p>
                  </div>
                </div>
                
                <div className="h-px bg-[#343947] w-full my-6"></div>

                {/* Key Takeaways */}
                <div className="space-y-6 bg-[#1a1d24] border border-[#343947] p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-[#FFD600] flex items-center gap-2">
                    Key Takeaways
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Vietnamese Key Takeaways</h4>
                      <ul className="list-disc pl-5 text-[#97a3b6] space-y-2 text-sm leading-relaxed">
                        <li>PayDef giải quyết thách thức quản lý nhiều cửa hàng, tài khoản và domain.</li>
                        <li>Tập trung hóa vận hành giúp theo dõi giao dịch và xử lý hoàn tiền dễ dàng hơn.</li>
                        <li>Định tuyến qua shield domains và sử dụng Identity Bundles giúp duy trì trải nghiệm người mua đồng nhất.</li>
                        <li>Nâng cao tính minh bạch và tốc độ xử lý lỗi thay vì cố tình lách luật nhà cung cấp.</li>
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">English Key Takeaways</h4>
                      <ul className="list-disc pl-5 text-[#97a3b6] space-y-2 text-sm leading-relaxed">
                        <li>PayDef solves the challenge of managing multiple stores, accounts, and domains.</li>
                        <li>Centralized operations make transaction tracking and refund handling much easier.</li>
                        <li>Routing via shield domains and using Identity Bundles maintains a consistent buyer experience.</li>
                        <li>Enhances operational clarity and error response speed rather than bypassing provider rules.</li>
                      </ul>
                    </div>
                  </div>
                </div>

              </div>
            </section>

            {/* Part 3 */}
            <section id="part-3" className="bg-[#222530] border border-[#343947] border-b-[3px] border-b-[#2a2e3b] shadow-[0_8px_24px_rgba(0,0,0,0.2)] rounded-xl overflow-hidden mt-8">
              <div className="px-6 py-5 border-b border-[#343947] bg-[#1f222c]">
                <h2 className="text-xl font-semibold text-[#e7edf8]">Part 3 — Core Concepts</h2>
              </div>
              
              <div className="p-6 space-y-8">
                {/* Vietnamese Section */}
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#2a2d39] border border-[#343947] text-sm font-medium text-[#b6c2d3]">
                    <span className="w-2 h-2 rounded-full bg-red-400"></span>
                    Vietnamese
                  </div>
                  <div className="text-[#e7edf8] leading-relaxed space-y-4 text-[15px]">
                    <p>
                      PayDef áp dụng một số khái niệm kỹ thuật và vận hành cốt lõi nhằm duy trì tính ổn định của dòng tiền và bảo vệ tài khoản thanh toán. Mục tiêu là giảm thiểu rủi ro tài khoản bị giới hạn (Limited) do những phán đoán nhầm lẫn từ thuật toán tự động của cổng thanh toán.
                    </p>
                    <div className="space-y-4 mt-4">
                      <div className="bg-[#1a1d24] border border-[#343947] p-4 rounded-lg">
                        <h4 className="text-[#FFD600] font-semibold mb-2">1. Giảm thiểu Limited (Limitation Mitigation)</h4>
                        <p className="text-sm text-[#b6c2d3]">
                          Thuật toán của các cổng thanh toán thường tự động giới hạn tài khoản (limited) khi phát hiện sự gia tăng đột biến về doanh thu (velocity spikes) hoặc sự thiếu nhất quán trong dữ liệu đơn hàng. PayDef giúp giảm thiểu rủi ro này bằng cách đảm bảo tính đồng nhất tuyệt đối về thông tin định danh (domain, email hỗ trợ, tên thương hiệu) và phân bổ lưu lượng giao dịch một cách hợp lý. Hệ thống không thể đảm bảo 100% không bị limited, nhưng giúp loại bỏ các nguyên nhân gốc rễ liên quan đến dữ liệu rác hoặc cấu hình sai lệch.
                        </p>
                      </div>
                      
                      <div className="bg-[#1a1d24] border border-[#343947] p-4 rounded-lg">
                        <h4 className="text-[#FFD600] font-semibold mb-2">2. Cấu trúc lại thông tin (Items Masking / Semantic Descriptors)</h4>
                        <p className="text-sm text-[#b6c2d3]">
                          Thay vì gửi một giỏ hàng chứa nhiều mã SKU phức tạp, lộn xộn hoặc thay đổi liên tục khiến hệ thống quét tự động dễ nhận diện nhầm là rủi ro cao, PayDef sử dụng <em>Payment Identity Bundles</em> để cấu trúc lại thông tin (Items Masking). Toàn bộ giỏ hàng sẽ được gom gọn lại thành một mô tả ngữ nghĩa duy nhất, sạch sẽ và chuyên nghiệp (ví dụ: "TireVix Auto - Tire & Wheel Order"). Điều này giúp giao dịch minh bạch, dễ hiểu đối với cả người mua và thuật toán, đồng thời giảm thiểu tỷ lệ khiếu nại.
                        </p>
                      </div>

                      <div className="bg-[#1a1d24] border border-[#343947] p-4 rounded-lg">
                        <h4 className="text-[#FFD600] font-semibold mb-2">3. Luân chuyển Tài khoản (PayPal Xoay / Account Rotation)</h4>
                        <p className="text-sm text-[#b6c2d3]">
                          Để tránh việc một tài khoản phải gánh chịu sự gia tăng khối lượng giao dịch (volume) quá nhanh, PayDef cung cấp tính năng luân chuyển (xoay) tài khoản PayPal. Hệ thống tự động phân bổ các giao dịch thanh toán sang nhiều tài khoản (merchant accounts) khác nhau dựa trên các thuật toán (ví dụ: weighted random). Việc "xoay PayPal" này giúp phân tán tải trọng (load balancing), duy trì ngưỡng an toàn của từng tài khoản, và đảm bảo kinh doanh không gián đoạn nếu một tài khoản cần xác minh.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-[#343947] w-full my-6"></div>

                {/* English Section */}
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#2a2d39] border border-[#343947] text-sm font-medium text-[#b6c2d3]">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    English
                  </div>
                  <div className="text-[#e7edf8] leading-relaxed space-y-4 text-[15px]">
                    <p>
                      PayDef applies several core technical and operational concepts to maintain cash flow stability and protect payment accounts. The primary goal is to minimize the risk of algorithmic limitations caused by automated payment gateway flags.
                    </p>
                    <div className="space-y-4 mt-4">
                      <div className="bg-[#1a1d24] border border-[#343947] p-4 rounded-lg">
                        <h4 className="text-[#FFD600] font-semibold mb-2">1. Limitation Mitigation (Giảm thiểu Limited)</h4>
                        <p className="text-sm text-[#b6c2d3]">
                          Payment gateway algorithms often flag and limit accounts when they detect sudden velocity spikes or inconsistent metadata. PayDef mitigates this risk by enforcing strict consistency in identity data (shield domains, support emails, brand names) and managing transaction distribution. While the system cannot guarantee zero limitations, it effectively eliminates root causes related to messy data or misconfigurations.
                        </p>
                      </div>
                      
                      <div className="bg-[#1a1d24] border border-[#343947] p-4 rounded-lg">
                        <h4 className="text-[#FFD600] font-semibold mb-2">2. Semantic Item Descriptors (Items Masking)</h4>
                        <p className="text-sm text-[#b6c2d3]">
                          Sending raw carts with complex, varied, or constantly changing SKU codes can trigger automated risk flags due to misclassification. Instead of exposing messy cart data, PayDef uses <em>Payment Identity Bundles</em> to cleanly summarize the order (Items Masking). The entire cart is aggregated into a single, clean, semantic descriptor (e.g., "TireVix Auto - Tire & Wheel Order"). This ensures the transaction is highly transparent to both the buyer and automated scanners.
                        </p>
                      </div>

                      <div className="bg-[#1a1d24] border border-[#343947] p-4 rounded-lg">
                        <h4 className="text-[#FFD600] font-semibold mb-2">3. Load Balancing & Account Rotation (PayPal Xoay)</h4>
                        <p className="text-sm text-[#b6c2d3]">
                          To prevent accounts from experiencing unsafe transaction velocity spikes, PayDef features automated Account Rotation. The system smartly distributes incoming checkout traffic across multiple configured merchant accounts using weighted routing logic. This "PayPal Xoay" acts as a load balancer, maintaining safe operational thresholds for each account and ensuring business continuity if one account undergoes routine compliance verification.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="h-px bg-[#343947] w-full my-6"></div>

                {/* Key Takeaways */}
                <div className="space-y-6 bg-[#1a1d24] border border-[#343947] p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-[#FFD600] flex items-center gap-2">
                    Key Takeaways
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Vietnamese Key Takeaways</h4>
                      <ul className="list-disc pl-5 text-[#97a3b6] space-y-2 text-sm leading-relaxed">
                        <li><strong>Giảm thiểu Limited:</strong> Ngăn chặn thuật toán cắm cờ do dữ liệu sai lệch hoặc doanh thu tăng trưởng bất thường.</li>
                        <li><strong>Items Masking:</strong> Gộp giỏ hàng phức tạp thành một mô tả đơn giản, sạch sẽ (Identity Bundles) để tránh nhận diện nhầm rủi ro.</li>
                        <li><strong>PayPal Xoay:</strong> Phân bổ đều giao dịch (load balancing) qua nhiều tài khoản để tránh quá tải (velocity spikes).</li>
                        <li>Cốt lõi của PayDef là vận hành an toàn, ổn định và minh bạch, không phải là công cụ gian lận hệ thống.</li>
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">English Key Takeaways</h4>
                      <ul className="list-disc pl-5 text-[#97a3b6] space-y-2 text-sm leading-relaxed">
                        <li><strong>Limitation Mitigation:</strong> Prevents automated flags caused by inconsistent data or sudden volume spikes.</li>
                        <li><strong>Items Masking:</strong> Aggregates complex carts into clean, semantic descriptors (Identity Bundles) to prevent misclassification.</li>
                        <li><strong>Account Rotation:</strong> Distributes checkout traffic across multiple accounts to maintain safe velocity thresholds.</li>
                        <li>PayDef's core philosophy focuses on operational safety, stability, and transparency, not system manipulation.</li>
                      </ul>
                    </div>
                  </div>
                </div>

              </div>
            </section>

            {/* Part 4 */}
            <section id="part-4" className="bg-[#222530] border border-[#343947] border-b-[3px] border-b-[#2a2e3b] shadow-[0_8px_24px_rgba(0,0,0,0.2)] rounded-xl overflow-hidden mt-8">
              <div className="px-6 py-5 border-b border-[#343947] bg-[#1f222c]">
                <h2 className="text-xl font-semibold text-[#e7edf8]">Part 4 — Payment Display Profile</h2>
              </div>
              
              <div className="p-6 space-y-8">
                {/* Vietnamese Section */}
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#2a2d39] border border-[#343947] text-sm font-medium text-[#b6c2d3]">
                    <span className="w-2 h-2 rounded-full bg-red-400"></span>
                    Vietnamese
                  </div>
                  <div className="text-[#e7edf8] leading-relaxed space-y-4 text-[15px]">
                    <p>
                      <strong>Payment Display Profile</strong> là một bộ cấu hình được gán cho cửa hàng nhằm kiểm soát chính xác cách giao dịch hiển thị với cả khách hàng và hệ thống cổng thanh toán (PayPal). Mục tiêu chính của nó là tạo ra một "bộ mặt" chuyên nghiệp và đồng nhất cho mọi luồng thanh toán.
                    </p>
                    
                    <div className="space-y-4 mt-4">
                      <div className="bg-[#1a1d24] border border-[#343947] p-4 rounded-lg">
                        <h4 className="text-[#FFD600] font-semibold mb-2">Các thành phần cấu hình và tác dụng:</h4>
                        <ul className="list-disc pl-5 text-sm text-[#b6c2d3] space-y-2">
                          <li><strong>Industry Vertical (Ngành hàng):</strong> Xác định lĩnh vực kinh doanh (ví dụ: Automotive, Beauty). Khi điền đúng, nó giúp cổng thanh toán hiểu được đặc thù giao dịch của bạn, tránh bị gắn cờ do hành vi mua sắm không khớp với phân loại tài khoản.</li>
                          <li><strong>Public Brand Name & Descriptor Prefix (Tên thương hiệu):</strong> Thay vì để hệ thống tự lấy các domain lộn xộn hoặc tên công ty ngẫu nhiên, bạn khai báo một tên thương hiệu sạch sẽ (ví dụ: "TireVix"). Điều này tạo sự tin tưởng tuyệt đối cho người mua và làm cho sao kê tài khoản trông minh bạch.</li>
                          <li><strong>Line Item Policy (Chính sách đơn hàng):</strong> Thay vì truyền đi một danh sách dài các mã sản phẩm (SKU) có nguy cơ rủi ro cao hoặc thường xuyên thay đổi, hệ thống sẽ gom chúng lại thành một mô tả ngữ nghĩa duy nhất (Ví dụ: "TireVix Auto - Tire & Wheel Order").</li>
                        </ul>
                      </div>
                      
                      <div className="bg-[#4a3908]/20 border border-[#ca8a04]/30 p-4 rounded-lg">
                        <h4 className="text-[#facc15] font-semibold mb-2">Tại sao cấu hình này giúp giảm thiểu Limited?</h4>
                        <p className="text-sm text-[#e7edf8]">
                          Khi bạn kinh doanh các mặt hàng có tỷ lệ Limited cao (như dropshipping, sản phẩm trend), thuật toán quét tự động của PayPal rất nhạy cảm với dữ liệu "rác": tên cửa hàng không nhất quán, mã hàng hóa lạ, hoặc mô tả dịch vụ chung chung mờ ám. Payment Display Profile hoạt động như một bộ lọc "làm sạch" dữ liệu. Nó định dạng mọi giao dịch thành một luồng thanh toán doanh nghiệp tiêu chuẩn, an toàn và đồng nhất. Khi hệ thống nhận được dữ liệu sạch sẽ, thuật toán sẽ bỏ qua các cờ rủi ro về nhận diện (identity flags), giúp tỷ lệ sống của tài khoản tăng lên đáng kể.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-[#343947] w-full my-6"></div>

                {/* English Section */}
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#2a2d39] border border-[#343947] text-sm font-medium text-[#b6c2d3]">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    English
                  </div>
                  <div className="text-[#e7edf8] leading-relaxed space-y-4 text-[15px]">
                    <p>
                      A <strong>Payment Display Profile</strong> is a configuration set assigned to your store to precisely control how transactions appear to both the buyer and the payment gateway (PayPal). Its primary purpose is to establish a professional, highly consistent "face" for all payment flows.
                    </p>
                    
                    <div className="space-y-4 mt-4">
                      <div className="bg-[#1a1d24] border border-[#343947] p-4 rounded-lg">
                        <h4 className="text-[#FFD600] font-semibold mb-2">Configuration Components and Their Impact:</h4>
                        <ul className="list-disc pl-5 text-sm text-[#b6c2d3] space-y-2">
                          <li><strong>Industry Vertical:</strong> Defines your business category (e.g., Automotive, Beauty). Properly categorizing your store aligns your transaction behavior with the gateway's expectations, preventing automated flags caused by category mismatches.</li>
                          <li><strong>Public Brand Name & Descriptor Prefix:</strong> Instead of passing messy domains or random company names, you declare a clean, established brand name (e.g., "TireVix"). This builds immediate buyer trust and ensures transparent billing statements.</li>
                          <li><strong>Line Item Policy:</strong> Instead of transmitting a long, risky list of constantly changing product SKUs, the system aggregates the cart into a single, clean semantic descriptor (e.g., "TireVix Auto - Tire & Wheel Order").</li>
                        </ul>
                      </div>
                      
                      <div className="bg-[#4a3908]/20 border border-[#ca8a04]/30 p-4 rounded-lg">
                        <h4 className="text-[#facc15] font-semibold mb-2">Why does this mitigate Limitations?</h4>
                        <p className="text-sm text-[#e7edf8]">
                          When selling high-risk or high-velocity items, automated PayPal scanning algorithms are highly sensitive to "dirty" data: inconsistent storefront names, strange item codes, or vague service descriptions. The Payment Display Profile acts as a strict data sanitizer. It formats every transaction into a perfectly standard, safe, corporate payment flow. By feeding the gateway clean and transparent metadata, it eliminates identity and data-structure risk flags, significantly increasing account lifespan and stability.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="h-px bg-[#343947] w-full my-6"></div>

                {/* Key Takeaways */}
                <div className="space-y-6 bg-[#1a1d24] border border-[#343947] p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-[#FFD600] flex items-center gap-2">
                    Key Takeaways
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Vietnamese Key Takeaways</h4>
                      <ul className="list-disc pl-5 text-[#97a3b6] space-y-2 text-sm leading-relaxed">
                        <li>Cấu hình hiển thị giúp "làm sạch" dữ liệu trước khi gửi lên cổng thanh toán.</li>
                        <li>Định danh thương hiệu rõ ràng làm tăng độ tin cậy và giảm tỷ lệ tranh chấp (dispute).</li>
                        <li>Gộp giỏ hàng (Line Item Policy) giúp che giấu các SKU rủi ro cao thành một đơn hàng chuẩn mực.</li>
                        <li>Ngăn chặn thuật toán tự động khóa tài khoản vì nghi ngờ "gian lận nhận diện" hoặc "dữ liệu rác".</li>
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">English Key Takeaways</h4>
                      <ul className="list-disc pl-5 text-[#97a3b6] space-y-2 text-sm leading-relaxed">
                        <li>Display profiles act as a data sanitizer before transactions hit the gateway.</li>
                        <li>Clear brand naming builds trust and immediately lowers dispute rates.</li>
                        <li>Line Item Policy cleanly aggregates high-risk SKUs into standard corporate orders.</li>
                        <li>Prevents automated bots from limiting accounts based on "identity fraud" or "messy data" triggers.</li>
                      </ul>
                    </div>
                  </div>
                </div>

              </div>
            </section>

            {/* Part 5 */}
            <section id="part-5" className="bg-[#222530] border border-[#343947] border-b-[3px] border-b-[#2a2e3b] shadow-[0_8px_24px_rgba(0,0,0,0.2)] rounded-xl overflow-hidden mt-8">
              <div className="px-6 py-5 border-b border-[#343947] bg-[#1f222c]">
                <h2 className="text-xl font-semibold text-[#e7edf8]">Part 5 — Payment Identity Bundle</h2>
              </div>
              
              <div className="p-6 space-y-8">
                {/* Vietnamese Section */}
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#2a2d39] border border-[#343947] text-sm font-medium text-[#b6c2d3]">
                    <span className="w-2 h-2 rounded-full bg-red-400"></span>
                    Vietnamese
                  </div>
                  <div className="text-[#e7edf8] leading-relaxed space-y-4 text-[15px]">
                    <p>
                      <strong>Payment Identity Bundle</strong> là một tính năng kiểm soát nâng cao (chỉ dành cho Super Admin) cho phép ghi đè (override) và áp đặt các thông tin nhận diện cốt lõi lên bất kỳ luồng thanh toán nào. Tính năng này hoạt động độc lập và có mức độ ưu tiên cao hơn Payment Display Profile của từng cửa hàng.
                    </p>
                    
                    <div className="space-y-4 mt-4">
                      <div className="bg-[#1a1d24] border border-[#343947] p-4 rounded-lg">
                        <h4 className="text-[#FFD600] font-semibold mb-2">Gói Định danh này hoạt động như thế nào?</h4>
                        <ul className="list-disc pl-5 text-sm text-[#b6c2d3] space-y-2">
                          <li><strong>Semantic Overrides (Ghi đè mô tả):</strong> Khi được kích hoạt, Identity Bundle sẽ tự động thay thế mọi thông tin giỏ hàng hoặc tên thương hiệu của cửa hàng bằng "Candidate Descriptor" (mô tả đã được chuẩn hóa, ví dụ: <em>"TireVix Auto - Tire & Wheel Order"</em>).</li>
                          <li><strong>Assignment Rules (Luật gán tự động):</strong> Bundle không gán trực tiếp cho một cửa hàng, mà gán cho các Tài khoản PayPal (Merchant Accounts) hoặc Domain bảo vệ (Shield Domains). Khi một giao dịch khớp với ID tài khoản hoặc domain đã được gán, luật định danh sẽ tự động được kích hoạt (Enforced).</li>
                          <li><strong>Fallback Safety (Cơ chế an toàn):</strong> Nếu thông tin định danh vượt quá độ dài cho phép của API (127 ký tự) hoặc bundle không hợp lệ, hệ thống sẽ tự động hạ cấp (fallback) về cấu hình Payment Display Profile mặc định mà không làm gián đoạn quá trình thanh toán.</li>
                        </ul>
                      </div>
                      
                      <div className="bg-[#4a3908]/20 border border-[#ca8a04]/30 p-4 rounded-lg">
                        <h4 className="text-[#facc15] font-semibold mb-2">Tại sao Payment Identity Bundle lại quan trọng?</h4>
                        <p className="text-sm text-[#e7edf8]">
                          Đối với một hệ thống luân chuyển tài khoản (Account Rotation) quy mô lớn, rủi ro lớn nhất là lỗi cấu hình từ phía người dùng (ví dụ: vô tình đổi tên thương hiệu thành một từ khóa bị cấm). Payment Identity Bundle đóng vai trò là "chốt chặn cuối cùng" (failsafe). Nó đảm bảo rằng dù người bán có thay đổi gì trên cửa hàng, thông tin gửi lên PayPal vẫn luôn chuẩn xác, nhất quán và tuân thủ tuyệt đối quy định của cổng thanh toán. Điều này giúp bảo vệ toàn bộ mạng lưới tài khoản khỏi nguy cơ bị giới hạn (limited) hàng loạt do sai sót dữ liệu.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-[#343947] w-full my-6"></div>

                {/* English Section */}
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#2a2d39] border border-[#343947] text-sm font-medium text-[#b6c2d3]">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    English
                  </div>
                  <div className="text-[#e7edf8] leading-relaxed space-y-4 text-[15px]">
                    <p>
                      A <strong>Payment Identity Bundle</strong> is an advanced, Super Admin-controlled feature that enforces core identity metadata across payment flows, overriding individual store-level Payment Display Profiles.
                    </p>
                    
                    <div className="space-y-4 mt-4">
                      <div className="bg-[#1a1d24] border border-[#343947] p-4 rounded-lg">
                        <h4 className="text-[#FFD600] font-semibold mb-2">How does the Identity Bundle work?</h4>
                        <ul className="list-disc pl-5 text-sm text-[#b6c2d3] space-y-2">
                          <li><strong>Semantic Overrides:</strong> When active, the Identity Bundle intercepts the transaction before it reaches PayPal and replaces any cart items or store names with a pre-approved "Candidate Descriptor" (e.g., <em>"TireVix Auto - Tire & Wheel Order"</em>).</li>
                          <li><strong>Assignment Rules:</strong> Instead of being bound to a specific store, Bundles are assigned directly to PayPal Merchant Accounts or Shield Domains. Any checkout flow routed through a matched account or domain will automatically trigger the bundle enforcement.</li>
                          <li><strong>Fallback Safety:</strong> If the generated descriptor exceeds PayPal's strict character limits (127 chars) or if the bundle is missing active items, the system seamlessly falls back to the store's default Payment Display Profile without interrupting the checkout process.</li>
                        </ul>
                      </div>
                      
                      <div className="bg-[#4a3908]/20 border border-[#ca8a04]/30 p-4 rounded-lg">
                        <h4 className="text-[#facc15] font-semibold mb-2">Why is the Payment Identity Bundle crucial?</h4>
                        <p className="text-sm text-[#e7edf8]">
                          In a large-scale Account Rotation network, the biggest risk is user misconfiguration (e.g., accidentally changing a store name to a prohibited keyword). The Payment Identity Bundle acts as the ultimate failsafe. It guarantees that regardless of what a merchant configures at the store level, the final payload submitted to the gateway is perfectly sanitized, consistent, and compliant. This strict enforcement protects the entire merchant account network from cascading limitations caused by accidental data errors.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="h-px bg-[#343947] w-full my-6"></div>

                {/* Key Takeaways */}
                <div className="space-y-6 bg-[#1a1d24] border border-[#343947] p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-[#FFD600] flex items-center gap-2">
                    Key Takeaways
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">Vietnamese Key Takeaways</h4>
                      <ul className="list-disc pl-5 text-[#97a3b6] space-y-2 text-sm leading-relaxed">
                        <li>Identity Bundle là tính năng cấp cao dùng để ghi đè (override) dữ liệu gửi lên PayPal.</li>
                        <li>Hoạt động dựa trên nguyên tắc gán tự động vào Merchant Account hoặc Shield Domain.</li>
                        <li>Đóng vai trò như "chốt chặn an toàn" để ngăn chặn lỗi cấu hình từ người dùng làm ảnh hưởng đến tài khoản.</li>
                        <li>Luôn ưu tiên sự an toàn: tự động fallback nếu dữ liệu vi phạm giới hạn ký tự của API.</li>
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-[#b6c2d3]">English Key Takeaways</h4>
                      <ul className="list-disc pl-5 text-[#97a3b6] space-y-2 text-sm leading-relaxed">
                        <li>Identity Bundle is a high-level tool used to override payload data sent to PayPal.</li>
                        <li>Operates via assignment rules tied directly to Merchant Accounts or Shield Domains.</li>
                        <li>Acts as the ultimate safety net to prevent user misconfigurations from risking account health.</li>
                        <li>Built with a strict fallback mechanism to gracefully handle API character limit constraints.</li>
                      </ul>
                    </div>
                  </div>
                </div>

              </div>
            </section>
          </div>
        </div>
      </main>
    </DashboardShell>
  )
}
