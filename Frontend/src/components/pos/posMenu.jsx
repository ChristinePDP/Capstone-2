import { Search } from 'lucide-react';

const CATEGORIES = ['All', 'Pastry', 'Cake', 'Package', 'Celebration Material'];

export default function PosMenu({ products, activeCategory, setActiveCategory, searchQuery, setSearchQuery, onAddToCart }) {
  
  const renderProductGrid = () => {
    const categoriesToRender = activeCategory === 'All' 
      ? CATEGORIES.filter(c => c !== 'All') 
      : [activeCategory];

    return categoriesToRender.map(cat => {
      const catProducts = products.filter(p => p.category === cat);
      if (catProducts.length === 0) return null;

      return (
        <div key={cat} className="mb-8">
          <div className="flex items-center justify-between mb-4 border-b border-[#EAE4E0] pb-2.5">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-[#8A7264] font-bold">{cat}</h3>
            <span className="text-[11px] text-[#B7A99F]">{catProducts.length} items</span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-4">
            {catProducts.map(p => {
              const isBuyNowItem = p.order_type === 'Pick-up Today';
              const currentStock = p.available_stock ?? p.stock_quantity ?? 0;
              const isSoldOut = isBuyNowItem && currentStock <= 0;
              
              const isVariable = p.pricing_mode === 'variable' && p.price_matrix?.length > 0;
              const minPrice = isVariable ? Math.min(...p.price_matrix.map(m => m.price)) : p.price;
              
              const isCustomizable = (p.order_slip_fields && p.order_slip_fields.length > 0) || p.allow_file_upload || isVariable;

              return (
                <div key={p.id} className="bg-white rounded-2xl border border-[#EAE4E0] overflow-hidden flex flex-col group shadow-sm relative">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#F5EFEB] shrink-0">
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    
                    {isBuyNowItem && (
                      <div className={`absolute top-2 left-2 px-2.5 py-1 rounded-md shadow-sm border border-white/20 z-10 backdrop-blur-sm ${isSoldOut ? 'bg-red-500/90 text-white' : 'bg-white/90 text-[#3B1F0A]'}`}>
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          {isSoldOut ? 'Sold Out' : `${currentStock} Available`}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 sm:p-4 lg:p-3 flex flex-col flex-1">
                    <span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] mb-1">{p.category}</span>
                    <h3 className="font-bold text-xs sm:text-sm lg:text-xs text-[#3B1F0A] mb-1.5 lg:mb-1.5 leading-snug flex-1 line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem] lg:min-h-[2.25rem]">{p.name}</h3>
                    <p className="text-xs sm:text-sm lg:text-xs font-bold text-[#5A453C] mb-2 lg:mb-2">
                      {isVariable ? 'Starting at ' : ''}₱{Number(minPrice).toLocaleString()}
                    </p>
                    <button
                      onClick={() => !isSoldOut && onAddToCart(p)}
                      disabled={isSoldOut}
                      className={`w-full py-2 sm:py-2.5 lg:py-2 rounded-full text-[11px] sm:text-xs font-semibold transition-colors ${
                        isSoldOut
                          ? 'bg-[#EAE4E0] text-[#8A7264] cursor-not-allowed'
                          : 'bg-[#3B1F0A] text-white hover:bg-[#2A1608]'
                      }`}
                    >
                      {isSoldOut ? 'Out of Stock' : (isCustomizable ? 'Select Options' : 'Add to Cart')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      <div className="shrink-0 pb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A7264]" size={16} />
            <input 
              type="text" 
              placeholder="Search product..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#EAE4E0] rounded-full text-sm focus:outline-none focus:border-[#5A453C] transition-colors"
            />
          </div>
          
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {CATEGORIES.map(cat => (
              <button 
                key={cat} 
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === cat 
                    ? 'bg-[#3B1F0A] text-white shadow-sm' 
                    : 'bg-white border border-[#EAE4E0] text-[#8A7264] hover:bg-[#F5EFEB]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin pr-2 pb-10">
        {renderProductGrid()}
      </div>
    </div>
  );
}