import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-[#4A1F00] text-white">
      <div className="max-w-7xl mx-auto px-6 py-16">

        <div className="grid md:grid-cols-4 gap-12">

          {/* Logo & Description */}
          <div>
            <div className="flex items-center gap-3 mb-5">
              <img
                src="/logo.png"
                alt="Aileen Cake Max"
                className="w-14 h-14 rounded-full object-cover"
              />

              <div>
                <h3 className="text-2xl font-semibold">
                  Aileen Cake Max
                </h3>
                <p className="uppercase tracking-widest text-sm text-gray-300">
                  Bake Shop
                </p>
              </div>
            </div>

            <p className="text-gray-300 leading-7">
              Handcrafting moments of joy through artisan cakes and
              pastries in the heart of Calaca, Batangas.
            </p>
          </div>

          {/* Explore */}
          <div>
            <h4 className="uppercase tracking-widest font-semibold mb-5">
              Explore
            </h4>

            <ul className="space-y-3">
              <li>
                <Link to="/menu" className="hover:text-[#D8B89A] transition">
                  Menu
                </Link>
              </li>
              <li>
      <Link to="/" className="hover:text-[#D8B89A] transition">
        Home
      </Link>
    </li>

    <li>
  <a href="#how-to-order" className="hover:text-[#D8B89A] transition">
    How to Order
  </a>
</li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="uppercase tracking-widest font-semibold mb-5">
              Contact Us
            </h4>

            <div className="space-y-4 text-gray-300">
              <p>📞 0975-858-3764</p>
              <p>✉️ hello@aileencakemax.com</p>
            </div>
          </div>

          {/* Shop Hours */}
          <div>
            <h4 className="uppercase tracking-widest font-semibold mb-5">
              Shop Hours
            </h4>

            <div className="space-y-3 text-gray-300">
              <div>
                <p className="font-medium text-white">Mon - Fri</p>
                <p>8:00 AM - 6:00 PM</p>
              </div>

              <div>
                <p className="font-medium text-white">Saturday</p>
                <p>9:00 AM - 5:00 PM</p>
              </div>

              <div>
                <p className="font-medium text-white">Sunday</p>
                <p>Closed</p>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom */}
        <div className="border-t border-[#6A3A20] mt-12 pt-6 flex flex-col md:flex-row justify-between items-center text-sm text-gray-300">

          <p>
            © 2020 AILEEN CAKE MAX. ALL RIGHTS RESERVED.
          </p>

          <div className="flex gap-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-white">
              Privacy Policy
            </a>

            <a href="#" className="hover:text-white">
              Terms of Service
            </a>
          </div>

        </div>

      </div>
    </footer>
  );
}