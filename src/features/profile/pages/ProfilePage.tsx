import React, { useState, useEffect } from 'react';
import { 
  User, 
  MapPin, 
  Phone as PhoneIcon, 
  Clock, 
  Check, 
  Upload, 
  Calendar,
  DollarSign,
  Mail,
  FileText,
  Star,
  Map,
  Edit2,
  X
} from 'lucide-react';
import { STORAGE_KEYS } from '../../../core/config/constants';
import apiClient from '../../../core/api/client';
import confetti from 'canvas-confetti';

declare global {
  interface Window {
    ymaps: any;
  }
}

interface OpeningHours {
  restaurant: string;
  mon: boolean;
  tue: boolean;
  wed: boolean;
  thu: boolean;
  fri: boolean;
  sat: boolean;
  sun: boolean;
  from_hour: string;
  to_hour: string;
}

const ProfilePage: React.FC = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [minOrderAmount, setMinOrderAmount] = useState('0');
  const [deliveryFee, setDeliveryFee] = useState('0');
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState('0');
  const [locationLat, setLocationLat] = useState<number | string>('');
  const [locationLong, setLocationLong] = useState<number | string>('');
  const [rating, setRating] = useState('5.0');
  const [partnerType, setPartnerType] = useState('RESTAURANT');
  const [profileId, setProfileId] = useState<number | string>('');
  const [profileUuid, setProfileUuid] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [copiedCoords, setCopiedCoords] = useState(false);

  const handleCopyCoords = () => {
    if (locationLat && locationLong) {
      navigator.clipboard.writeText(`${locationLat}, ${locationLong}`);
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 2000);
    }
  };

  const handleDetectLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = parseFloat(position.coords.latitude.toFixed(6));
          const lng = parseFloat(position.coords.longitude.toFixed(6));
          setLocationLat(lat);
          setLocationLong(lng);
        },
        (error) => {
          console.error("Geolocation failed:", error);
        }
      );
    }
  };

  // Yandex Map states and refs
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = React.useRef<any>(null);
  const placemarkRef = React.useRef<any>(null);

  useEffect(() => {
    if (window.ymaps) {
      setMapLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://api-maps.yandex.ru/2.1/?lang=uz_UZ';
    script.async = true;
    script.onload = () => {
      window.ymaps.ready(() => {
        setMapLoaded(true);
      });
    };
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!mapLoaded || !window.ymaps) return;

    const lat = parseFloat(locationLat as string) || 41.311081;
    const lng = parseFloat(locationLong as string) || 69.240562;

    const mapContainer = document.getElementById('yandex-map');
    if (!mapContainer) return;

    mapContainer.innerHTML = '';

    try {
      const myMap = new window.ymaps.Map('yandex-map', {
        center: [lat, lng],
        zoom: 13,
        controls: ['zoomControl', 'fullscreenControl']
      });

      const myPlacemark = new window.ymaps.Placemark(
        [lat, lng],
        {
          hintContent: name || "Muassasa joylashuvi",
          balloonContent: address || "Bizning manzil"
        },
        {
          draggable: isEditing,
          preset: 'islands#blueDotIconWithCaption'
        }
      );

      // Event listener for dragging marker
      myPlacemark.events.add('dragend', () => {
        const coords = myPlacemark.geometry.getCoordinates();
        const newLat = parseFloat(coords[0].toFixed(6));
        const newLng = parseFloat(coords[1].toFixed(6));
        setLocationLat(newLat);
        setLocationLong(newLng);
      });

      // Click on map to set position in edit mode
      myMap.events.add('click', (e: any) => {
        if (!isEditing) return;
        const coords = e.get('coords');
        const newLat = parseFloat(coords[0].toFixed(6));
        const newLng = parseFloat(coords[1].toFixed(6));
        setLocationLat(newLat);
        setLocationLong(newLng);
        myPlacemark.geometry.setCoordinates(coords);
      });

      myMap.geoObjects.add(myPlacemark);
      mapRef.current = myMap;
      placemarkRef.current = myPlacemark;
    } catch (error) {
      console.error("Yandex Map initialization failed:", error);
    }

    return () => {
      if (mapRef.current) {
        try {
          mapRef.current.destroy();
        } catch (e) {}
        mapRef.current = null;
        placemarkRef.current = null;
      }
    };
  }, [mapLoaded, isEditing]);

  useEffect(() => {
    if (placemarkRef.current && mapRef.current) {
      const lat = parseFloat(locationLat as string);
      const lng = parseFloat(locationLong as string);
      if (!isNaN(lat) && !isNaN(lng)) {
        const currentCoords = placemarkRef.current.geometry.getCoordinates();
        if (currentCoords[0] !== lat || currentCoords[1] !== lng) {
          placemarkRef.current.geometry.setCoordinates([lat, lng]);
          mapRef.current.setCenter([lat, lng]);
        }
      }
    }
  }, [locationLat, locationLong]);
  
  // Banner / Logo previews
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);

  // Opening Hours state
  const [openingHours, setOpeningHours] = useState<OpeningHours>({
    restaurant: '',
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
    sun: false,
    from_hour: '08:00',
    to_hour: '22:00'
  });

  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await apiClient.get('partner/me/');
        const profileData = response.data.data;
        // Save to local storage for other pages to access
        localStorage.setItem(STORAGE_KEYS.PARTNER_DATA, JSON.stringify(profileData));
        
        // Update states
        setProfileId(profileData.id || '');
        setProfileUuid(profileData.uuid || '');
        setName(profileData.name || '');
        setAddress(profileData.address || '');
        setPhone(profileData.phone || '');
        setEmail(profileData.email || '');
        setDescription(profileData.description || '');
        setMinOrderAmount(profileData.min_order_amount || '0');
        setDeliveryFee(profileData.delivery_fee || '0');
        setFreeDeliveryThreshold(profileData.free_delivery_threshold || '0');
        setLocationLat(profileData.location_lat || '');
        setLocationLong(profileData.location_long || '');
        setRating(profileData.rating || '5.0');
        setPartnerType(profileData.partner_type || 'RESTAURANT');
        setIsOpen(profileData.is_open !== undefined ? profileData.is_open : true);
        setLogoPreview(profileData.logo || null);
        setBannerPreview(profileData.banner || null);

        const cleanHour = (h: string) => {
          if (!h) return '';
          const parts = h.split(':');
          if (parts.length >= 2) {
            return `${parts[0]}:${parts[1]}`;
          }
          return h;
        };

        if (profileData.opening_hours) {
          setOpeningHours({
            restaurant: profileData.uuid || '',
            mon: !!profileData.opening_hours.mon,
            tue: !!profileData.opening_hours.tue,
            wed: !!profileData.opening_hours.wed,
            thu: !!profileData.opening_hours.thu,
            fri: !!profileData.opening_hours.fri,
            sat: !!profileData.opening_hours.sat,
            sun: !!profileData.opening_hours.sun,
            from_hour: cleanHour(profileData.opening_hours.from_hour) || '08:00',
            to_hour: cleanHour(profileData.opening_hours.to_hour) || '22:00'
          });
        } else {
          setOpeningHours(prev => ({
            ...prev,
            restaurant: profileData.uuid || ''
          }));
        }
      } catch (err) {
        console.error("Failed to fetch fresh profile from API, loading local storage fallback:", err);
        // Fallback to localStorage
        const data = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
        if (data) {
          const parsed = JSON.parse(data);
          setProfileId(parsed.id || '');
          setProfileUuid(parsed.uuid || '');
          setName(parsed.name || '');
          setAddress(parsed.address || '');
          setPhone(parsed.phone || '');
          setEmail(parsed.email || '');
          setDescription(parsed.description || '');
          setMinOrderAmount(parsed.min_order_amount || '0');
          setDeliveryFee(parsed.delivery_fee || '0');
          setFreeDeliveryThreshold(parsed.free_delivery_threshold || '0');
          setLocationLat(parsed.location_lat || '');
          setLocationLong(parsed.location_long || '');
          setRating(parsed.rating || '5.0');
          setPartnerType(parsed.partner_type || 'RESTAURANT');
          setIsOpen(parsed.is_open !== undefined ? parsed.is_open : true);
          setLogoPreview(parsed.logo || null);
          setBannerPreview(parsed.banner || null);
          
          const cleanHour = (h: string) => {
            if (!h) return '';
            const parts = h.split(':');
            if (parts.length >= 2) {
              return `${parts[0]}:${parts[1]}`;
            }
            return h;
          };

          if (parsed.opening_hours) {
            setOpeningHours({
              restaurant: parsed.uuid || '',
              mon: !!parsed.opening_hours.mon,
              tue: !!parsed.opening_hours.tue,
              wed: !!parsed.opening_hours.wed,
              thu: !!parsed.opening_hours.thu,
              fri: !!parsed.opening_hours.fri,
              sat: !!parsed.opening_hours.sat,
              sun: !!parsed.opening_hours.sun,
              from_hour: cleanHour(parsed.opening_hours.from_hour) || '08:00',
              to_hour: cleanHour(parsed.opening_hours.to_hour) || '22:00'
            });
          } else {
            setOpeningHours(prev => ({
              ...prev,
              restaurant: parsed.uuid || ''
            }));
          }
        }
      }
    };
    
    fetchProfile();
  }, []);

  // fetchOpeningHours removed since opening hours data is nested inside partner/me/ response

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBannerFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setBannerPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleToggleDay = (dayKey: keyof Omit<OpeningHours, 'restaurant' | 'from_hour' | 'to_hour'>) => {
    setOpeningHours((prev) => ({
      ...prev,
      [dayKey]: !prev[dayKey]
    }));
  };

  const handleCancelEdits = () => {
    const data = localStorage.getItem(STORAGE_KEYS.PARTNER_DATA);
    if (data) {
      const parsed = JSON.parse(data);
      setProfileId(parsed.id || '');
      setProfileUuid(parsed.uuid || '');
      setName(parsed.name || '');
      setAddress(parsed.address || '');
      setPhone(parsed.phone || '');
      setEmail(parsed.email || '');
      setDescription(parsed.description || '');
      setMinOrderAmount(parsed.min_order_amount || '0');
      setDeliveryFee(parsed.delivery_fee || '0');
      setFreeDeliveryThreshold(parsed.free_delivery_threshold || '0');
      setLocationLat(parsed.location_lat || '');
      setLocationLong(parsed.location_long || '');
      setRating(parsed.rating || '5.0');
      setPartnerType(parsed.partner_type || 'RESTAURANT');
      setIsOpen(parsed.is_open !== undefined ? parsed.is_open : true);
      setLogoPreview(parsed.logo || null);
      setBannerPreview(parsed.banner || null);
      setLogoFile(null);
      setBannerFile(null);
      
      const cleanHour = (h: string) => {
        if (!h) return '';
        const parts = h.split(':');
        if (parts.length >= 2) {
          return `${parts[0]}:${parts[1]}`;
        }
        return h;
      };

      if (parsed.opening_hours) {
        setOpeningHours({
          restaurant: parsed.uuid || '',
          mon: !!parsed.opening_hours.mon,
          tue: !!parsed.opening_hours.tue,
          wed: !!parsed.opening_hours.wed,
          thu: !!parsed.opening_hours.thu,
          fri: !!parsed.opening_hours.fri,
          sat: !!parsed.opening_hours.sat,
          sun: !!parsed.opening_hours.sun,
          from_hour: cleanHour(parsed.opening_hours.from_hour) || '08:00',
          to_hour: cleanHour(parsed.opening_hours.to_hour) || '22:00'
        });
      } else {
        setOpeningHours(prev => ({
          ...prev,
          restaurant: parsed.uuid || ''
        }));
      }
    }
    setIsEditing(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg(null);

    try {
      const formattedOpeningHours = {
        mon: openingHours.mon,
        tue: openingHours.tue,
        wed: openingHours.wed,
        thu: openingHours.thu,
        fri: openingHours.fri,
        sat: openingHours.sat,
        sun: openingHours.sun,
        from_hour: openingHours.from_hour.length === 5 ? `${openingHours.from_hour}:00` : openingHours.from_hour,
        to_hour: openingHours.to_hour.length === 5 ? `${openingHours.to_hour}:00` : openingHours.to_hour,
      };

      // Profile metadata update
      const formData = new FormData();
      formData.append('name', name);
      formData.append('address', address);
      formData.append('phone', phone);
      formData.append('email', email);
      formData.append('description', description);
      formData.append('min_order_amount', minOrderAmount);
      formData.append('delivery_fee', deliveryFee);
      formData.append('free_delivery_threshold', freeDeliveryThreshold);
      formData.append('partner_type', partnerType);
      formData.append('is_open', isOpen ? 'true' : 'false');
      if (locationLat) formData.append('location_lat', locationLat.toString());
      if (locationLong) formData.append('location_long', locationLong.toString());
      if (logoFile) formData.append('logo', logoFile);
      if (bannerFile) formData.append('banner', bannerFile);
      
      // Merge opening hours into the profile update payload
      formData.append('opening_hours', JSON.stringify(formattedOpeningHours));

      const profileRes = await apiClient.put('partner/me/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const updatedData = profileRes.data.data;

      const mergedData = {
        ...updatedData,
        opening_hours: updatedData.opening_hours || formattedOpeningHours
      };
      
      localStorage.setItem(STORAGE_KEYS.PARTNER_DATA, JSON.stringify(mergedData));
      
      // Update states
      setProfileId(mergedData.id || '');
      setProfileUuid(mergedData.uuid || '');
      setName(mergedData.name || '');
      setAddress(mergedData.address || '');
      setPhone(mergedData.phone || '');
      setEmail(mergedData.email || '');
      setDescription(mergedData.description || '');
      setMinOrderAmount(mergedData.min_order_amount || '0');
      setDeliveryFee(mergedData.delivery_fee || '0');
      setFreeDeliveryThreshold(mergedData.free_delivery_threshold || '0');
      setLocationLat(mergedData.location_lat || '');
      setLocationLong(mergedData.location_long || '');
      setPartnerType(mergedData.partner_type || 'RESTAURANT');
      setIsOpen(mergedData.is_open !== undefined ? mergedData.is_open : true);
      setLogoPreview(mergedData.logo || null);
      setBannerPreview(mergedData.banner || null);

      const cleanHour = (h: string) => {
        if (!h) return '';
        const parts = h.split(':');
        if (parts.length >= 2) {
          return `${parts[0]}:${parts[1]}`;
        }
        return h;
      };

      if (mergedData.opening_hours) {
        setOpeningHours({
          restaurant: mergedData.uuid || '',
          mon: !!mergedData.opening_hours.mon,
          tue: !!mergedData.opening_hours.tue,
          wed: !!mergedData.opening_hours.wed,
          thu: !!mergedData.opening_hours.thu,
          fri: !!mergedData.opening_hours.fri,
          sat: !!mergedData.opening_hours.sat,
          sun: !!mergedData.opening_hours.sun,
          from_hour: cleanHour(mergedData.opening_hours.from_hour) || '08:00',
          to_hour: cleanHour(mergedData.opening_hours.to_hour) || '22:00'
        });
      }

      setLoading(false);
      setIsEditing(false);
      setSuccessMsg("Profil ma'lumotlari muvaffaqiyatli saqlandi!");
      confetti({ particleCount: 50, spread: 60 });
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setLoading(false);
      console.error("Profil saqlashda xatolik tafsilotlari:", err.response?.data || err);
      alert("Profil ma'lumotlarini saqlashda xatolik yuz berdi.");
    }
  };

  const daysList: Array<{ key: keyof Omit<OpeningHours, 'restaurant' | 'from_hour' | 'to_hour'>; label: string }> = [
    { key: 'mon', label: 'Dush' },
    { key: 'tue', label: 'Sesh' },
    { key: 'wed', label: 'Chor' },
    { key: 'thu', label: 'Pay' },
    { key: 'fri', label: 'Jum' },
    { key: 'sat', label: 'Shan' },
    { key: 'sun', label: 'Yak' }
  ];

  return (
    <div className="space-y-8 font-Outfit text-left animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center flex-wrap gap-4 border-b border-white/5 pb-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            Sozlamalar <span className="bg-brand/10 text-brand p-1.5 rounded-xl"><User className="w-6 h-6" /></span>
          </h1>
          <p className="text-slate-400 text-sm mt-1">Muassasa ma'lumotlari, xaritadagi joylashuv va ish vaqtlarini o'zgartiring</p>
        </div>

        {/* Edit mode toggle button */}
        <button
          type="button"
          onClick={() => {
            if (isEditing) {
              handleCancelEdits();
            } else {
              setIsEditing(true);
            }
          }}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all duration-200 flex items-center gap-2 cursor-pointer border ${
            isEditing
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-white/10'
              : 'bg-brand hover:bg-brand-dark text-white border-transparent hover:shadow-brand/20 hover:scale-[1.02]'
          }`}
        >
          {isEditing ? (
            <>
              <X className="w-4 h-4" /> Bekor qilish
            </>
          ) : (
            <>
              <Edit2 className="w-4 h-4" /> Tahrirlash
            </>
          )}
        </button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm max-w-xl animate-fade-in shadow-lg shadow-emerald-500/5">
          <Check className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Profile Cover & Avatar Card */}
      <div className="relative rounded-3xl overflow-hidden border border-white/5 bg-slate-900/50 shadow-xl">
        {/* Banner container */}
        <div className="h-48 bg-gradient-to-r from-brand/20 via-slate-800 to-slate-900 relative group overflow-hidden">
          {bannerPreview ? (
            <img src={bannerPreview} alt="Cover Banner" className="w-full h-full object-cover transition duration-300 group-hover:scale-[1.02] animate-fade-in" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 bg-slate-800/20 backdrop-blur-md">
              <Upload className="w-8 h-8 text-slate-600 animate-pulse" />
            </div>
          )}
          {isEditing && (
            <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center cursor-pointer text-white font-medium text-sm gap-2 backdrop-blur-xs">
              <Upload className="w-5 h-5" /> Cover rasmni yangilash
              <input type="file" accept="image/*" onChange={handleBannerChange} className="hidden" />
            </label>
          )}
        </div>
        
        {/* Profile details overlap row */}
        <div className="p-6 pt-0 relative flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-gradient-to-t from-darkCard to-darkCard/95 border-t border-white/5">
          {/* Logo / Avatar container */}
          <div className="flex flex-col md:flex-row items-start md:items-end gap-4 -mt-12 md:-mt-10">
            <div className="relative w-24 h-24 rounded-2xl border-4 border-darkCard overflow-hidden bg-slate-900 shadow-lg group shrink-0">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-full h-full object-cover transition duration-300 group-hover:scale-105 animate-fade-in" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500 bg-slate-900/80">
                  <User className="w-8 h-8 text-slate-600" />
                </div>
              )}
              {isEditing && (
                <label className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition duration-200 flex items-center justify-center cursor-pointer text-white backdrop-blur-xs">
                  <Upload className="w-5 h-5" />
                  <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
                </label>
              )}
            </div>
            
            {/* Title / Description info */}
            <div className="space-y-1 mb-1">
              <h2 className="text-2xl font-bold text-white tracking-tight">{name || "Muassasa nomi"}</h2>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-xs font-bold text-brand bg-brand/10 px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-sm border border-brand/10">
                  <Star className="w-3.5 h-3.5 fill-current text-brand" /> {rating}
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  ID: #{profileId || 'N/A'}
                </span>
              </div>
            </div>
          </div>
          
          {/* Active status indicator badge */}
          <div className="flex items-center gap-2 bg-slate-900/60 py-1.5 px-3.5 rounded-xl border border-white/5 shadow-md">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isOpen ? 'animate-ping bg-emerald-400' : 'bg-rose-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isOpen ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
            <span className="text-xs font-bold text-slate-300 select-none">
              Muassasa holati: {isOpen ? "Ochiq" : "Yopiq"}
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSaveProfile} className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start pb-24">
        {/* Left Side: General Profile Form */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Card 1: Basic Info */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-darkCard to-slate-900/90 border border-white/5 space-y-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand/30"></div>
            <h3 className="font-bold text-white text-lg flex items-center gap-2 border-b border-white/5 pb-3">
              <User className="w-5 h-5 text-brand" /> Muassasa ma'lumotlari
            </h3>

            {/* Restaurant name */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Restoran nomi</label>
              <div className="relative group">
                <span className={`absolute inset-y-0 left-0 pl-3.5 flex items-center transition duration-150 ${isEditing ? 'text-brand' : 'text-slate-500'}`}>
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  readOnly={!isEditing}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition duration-150 font-Outfit ${
                    !isEditing
                      ? 'bg-slate-900/20 border-white/5 text-slate-300 cursor-text select-all focus:outline-none focus:ring-0'
                      : 'bg-slate-900 border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:shadow-[0_0_10px_rgba(14,165,233,0.15)]'
                  }`}
                  placeholder="Muassasa nomini kiriting"
                  required
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Tavsif (Description)</label>
              <div className="relative group">
                <span className={`absolute top-3 left-0 pl-3.5 flex items-start transition duration-150 ${isEditing ? 'text-brand' : 'text-slate-500'}`}>
                  <FileText className="w-4 h-4" />
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  readOnly={!isEditing}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition h-24 resize-none font-Outfit ${
                    !isEditing
                      ? 'bg-slate-900/20 border-white/5 text-slate-300 cursor-text select-all focus:outline-none focus:ring-0'
                      : 'bg-slate-900 border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:shadow-[0_0_10px_rgba(14,165,233,0.15)]'
                  }`}
                  placeholder="Restoraningiz haqida ma'lumot kiriting..."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Phone */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Telefon raqam</label>
                <div className="relative group">
                  <span className={`absolute inset-y-0 left-0 pl-3.5 flex items-center transition duration-150 ${isEditing ? 'text-brand' : 'text-slate-500'}`}>
                    <PhoneIcon className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    readOnly={!isEditing}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition duration-150 font-Outfit ${
                      !isEditing
                        ? 'bg-slate-900/20 border-white/5 text-slate-300 cursor-text select-all focus:outline-none focus:ring-0'
                        : 'bg-slate-900 border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:shadow-[0_0_10px_rgba(14,165,233,0.15)]'
                    }`}
                    placeholder="+998 (90) 123-45-67"
                    required
                  />
                </div>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Elektron pochta (Email)</label>
                <div className="relative group">
                  <span className={`absolute inset-y-0 left-0 pl-3.5 flex items-center transition duration-150 ${isEditing ? 'text-brand' : 'text-slate-500'}`}>
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly={!isEditing}
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition duration-150 font-Outfit ${
                      !isEditing
                        ? 'bg-slate-900/20 border-white/5 text-slate-300 cursor-text select-all focus:outline-none focus:ring-0'
                        : 'bg-slate-900 border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:shadow-[0_0_10px_rgba(14,165,233,0.15)]'
                    }`}
                    placeholder="letsgo@example.com"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Address and Map (Excluding coordinates inputs) */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-darkCard to-slate-900/90 border border-white/5 space-y-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand/30"></div>
            <h3 className="font-bold text-white text-lg flex items-center gap-2 border-b border-white/5 pb-3">
              <MapPin className="w-5 h-5 text-brand" /> Manzil va Joylashuv
            </h3>

            {/* Address */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Manzil</label>
              <div className="relative group">
                <span className={`absolute inset-y-0 left-0 pl-3.5 flex items-center transition duration-150 ${isEditing ? 'text-brand' : 'text-slate-500'}`}>
                  <MapPin className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  readOnly={!isEditing}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition duration-150 font-Outfit ${
                    !isEditing
                      ? 'bg-slate-900/20 border-white/5 text-slate-300 cursor-text select-all focus:outline-none focus:ring-0'
                      : 'bg-slate-900 border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:shadow-[0_0_10px_rgba(14,165,233,0.15)]'
                  }`}
                  placeholder="Muassasa manzili"
                  required
                />
              </div>
            </div>

            {/* Yandex Map Section with overlays */}
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 font-Outfit">
                Xaritadagi joylashuv (Yandex Xarita)
              </label>
              <div 
                className={`w-full h-80 rounded-2xl border overflow-hidden bg-slate-900 relative shadow-inner transition duration-200 ${
                  isEditing ? 'ring-2 ring-brand/35 border-brand/50 shadow-brand/10' : 'border-white/5'
                }`}
                style={{ minHeight: '320px' }}
              >
                {/* Yandex Map container element */}
                <div id="yandex-map" className="w-full h-full" />

                {/* Loading state indicator overlay */}
                {!mapLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 bg-slate-900/80 z-10">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
                      <span className="text-xs font-medium font-Outfit">Xarita yuklanmoqda...</span>
                    </div>
                  </div>
                )}

                {/* Edit active mode instruction banner overlay */}
                {isEditing && (
                  <div className="absolute top-3 left-3 right-3 bg-brand/90 backdrop-blur-md text-white py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg border border-white/10 z-10 animate-slide-in">
                    <MapPin className="w-3.5 h-3.5 animate-bounce" />
                    <span>Tahrirlash: markerni sudrang yoki xaritani bosing</span>
                  </div>
                )}

                {/* Coordinates values overlay inside the map container */}
                {locationLat && locationLong && (
                  <div className="absolute bottom-3 left-3 bg-slate-950/85 backdrop-blur-md text-slate-200 py-2.5 px-3.5 rounded-xl text-xs font-mono flex items-center gap-2.5 shadow-xl border border-white/10 z-10">
                    <Map className="w-3.5 h-3.5 text-brand" />
                    <span className="font-semibold">{parseFloat(locationLat.toString()).toFixed(6)}, {parseFloat(locationLong.toString()).toFixed(6)}</span>
                    <button
                      type="button"
                      onClick={handleCopyCoords}
                      className="hover:text-brand transition cursor-pointer p-0.5"
                      title="Koordinatalarni nusxalash"
                    >
                      {copiedCoords ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      ) : (
                        <svg className="w-3.5 h-3.5 text-slate-400 hover:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                        </svg>
                      )}
                    </button>
                  </div>
                )}

                {/* Auto-detect My Location Button Overlay (Edit Mode only) */}
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    className="absolute bottom-3 right-3 bg-brand hover:bg-brand-dark text-white py-2 px-3.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg hover:shadow-brand/20 transition duration-150 cursor-pointer z-10 scale-95 hover:scale-100"
                    title="Mening joylashuvimni aniqlash"
                  >
                    <svg className="w-4 h-4 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>Mening joylashuvim</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Card 3: Financial Settings */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-darkCard to-slate-900/90 border border-white/5 space-y-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand/30"></div>
            <h3 className="font-bold text-white text-lg flex items-center gap-2 border-b border-white/5 pb-3">
              <DollarSign className="w-5 h-5 text-brand" /> Moliyaviy va yetkazib berish sozlamalari
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Min Order Amount */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Minimal buyurtma</label>
                <div className="relative group">
                  <input
                    type="number"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(e.target.value)}
                    readOnly={!isEditing}
                    className={`w-full pr-14 pl-4 py-2.5 rounded-xl border text-sm transition duration-150 font-Outfit ${
                      !isEditing
                        ? 'bg-slate-900/20 border-white/5 text-slate-300 cursor-text select-all focus:outline-none focus:ring-0'
                        : 'bg-slate-900 border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:shadow-[0_0_10px_rgba(14,165,233,0.15)]'
                    }`}
                    placeholder="30000"
                  />
                  <span className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 text-xs font-bold select-none font-Outfit">
                    UZS
                  </span>
                </div>
              </div>

              {/* Delivery Fee */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Yetkazish narxi</label>
                <div className="relative group">
                  <input
                    type="number"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                    readOnly={!isEditing}
                    className={`w-full pr-14 pl-4 py-2.5 rounded-xl border text-sm transition duration-150 font-Outfit ${
                      !isEditing
                        ? 'bg-slate-900/20 border-white/5 text-slate-300 cursor-text select-all focus:outline-none focus:ring-0'
                        : 'bg-slate-900 border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:shadow-[0_0_10px_rgba(14,165,233,0.15)]'
                    }`}
                    placeholder="12000"
                  />
                  <span className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 text-xs font-bold select-none font-Outfit">
                    UZS
                  </span>
                </div>
              </div>

              {/* Free Delivery Threshold */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Tekin yetkazish limiti</label>
                <div className="relative group">
                  <input
                    type="number"
                    value={freeDeliveryThreshold}
                    onChange={(e) => setFreeDeliveryThreshold(e.target.value)}
                    readOnly={!isEditing}
                    className={`w-full pr-14 pl-4 py-2.5 rounded-xl border text-sm transition duration-150 font-Outfit ${
                      !isEditing
                        ? 'bg-slate-900/20 border-white/5 text-slate-300 cursor-text select-all focus:outline-none focus:ring-0'
                        : 'bg-slate-900 border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand focus:shadow-[0_0_10px_rgba(14,165,233,0.15)]'
                    }`}
                    placeholder="50000"
                  />
                  <span className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 text-xs font-bold select-none font-Outfit">
                    UZS
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Operating Hours */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-darkCard to-slate-900/90 border border-white/5 space-y-5 shadow-lg relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand/30"></div>
            <h3 className="font-bold text-white text-lg flex items-center gap-2 border-b border-white/5 pb-3">
              <Clock className="w-5 h-5 text-brand" /> Ish kunlari va ish vaqtlari
            </h3>

            {/* Weekdays pickers */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 font-Outfit">
                <Calendar className="w-4 h-4 text-slate-500" /> Ish kunlarini tanlang
              </label>
              
              <div className="flex flex-wrap gap-2.5">
                {daysList.map((day) => {
                  const isActive = openingHours[day.key];
                  return (
                    <button
                      key={day.key}
                      type="button"
                      disabled={!isEditing}
                      onClick={() => handleToggleDay(day.key)}
                      className={`px-4.5 py-2 rounded-xl text-xs font-bold border transition duration-150 select-none flex items-center gap-1.5 ${
                        !isEditing
                          ? 'cursor-not-allowed opacity-80'
                          : 'cursor-pointer hover:border-white/20 hover:scale-[1.02]'
                      } ${
                        isActive
                          ? 'bg-brand/15 border-brand text-brand shadow-sm shadow-brand/10'
                          : 'bg-slate-900/50 border-white/5 text-slate-400'
                      }`}
                    >
                      {isActive && <Check className="w-3.5 h-3.5 animate-fade-in" />}
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* From Hour and To Hour selectors */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 font-Outfit">Boshlanish vaqti</label>
                {isEditing ? (
                  <input
                    type="time"
                    value={openingHours.from_hour}
                    onChange={(e) => setOpeningHours({ ...openingHours, from_hour: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-slate-900 text-white cursor-pointer font-Outfit focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition"
                    required
                  />
                ) : (
                  <input
                    type="text"
                    value={openingHours.from_hour}
                    readOnly
                    className="w-full px-4 py-2.5 rounded-xl border border-transparent bg-slate-900/40 text-slate-400 cursor-not-allowed select-none pointer-events-none font-Outfit"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 font-Outfit">Tugash vaqti</label>
                {isEditing ? (
                  <input
                    type="time"
                    value={openingHours.to_hour}
                    onChange={(e) => setOpeningHours({ ...openingHours, to_hour: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-slate-900 text-white cursor-pointer font-Outfit focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition"
                    required
                  />
                ) : (
                  <input
                    type="text"
                    value={openingHours.to_hour}
                    readOnly
                    className="w-full px-4 py-2.5 rounded-xl border border-transparent bg-slate-900/40 text-slate-400 cursor-not-allowed select-none pointer-events-none font-Outfit"
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Account Details & Control Dashboard */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Status Switch (Control Panel) */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-darkCard to-slate-900/90 border border-white/5 space-y-5 shadow-lg text-left relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand/30"></div>
            <h3 className="font-bold text-white text-base border-b border-white/5 pb-3">Muassasa holati</h3>
            
            {/* Status toggle switch container */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/50 border border-white/5">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ish holati</span>
                <span className="text-sm font-bold text-white mt-1 flex items-center gap-2 select-none font-Outfit">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isOpen ? 'animate-ping bg-emerald-400' : 'bg-rose-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOpen ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                  </span>
                  {isOpen ? "Buyurtma olmoqda" : "Hozir yopiq"}
                </span>
              </div>
              
              <button
                type="button"
                disabled={!isEditing}
                onClick={() => setIsOpen(!isOpen)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  !isEditing ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'
                } ${
                  isOpen ? 'bg-emerald-500 animate-pulse-glow' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                    isOpen ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Quick Trigger Edit Button when not in editing state */}
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="w-full py-3 px-4 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-sm shadow-lg hover:shadow-brand/20 transition-all duration-200 flex justify-center items-center gap-2 cursor-pointer hover:scale-[1.02]"
              >
                <Edit2 className="w-4 h-4" />
                <span>Tahrirlash rejimiga o'tish</span>
              </button>
            )}
          </div>

          {/* Card 6: Account Details & UUID (Copyable) */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-darkCard to-slate-900/90 border border-white/5 space-y-4 shadow-lg text-left relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-brand/30"></div>
            <h4 className="font-bold text-white text-sm tracking-wide uppercase text-slate-400 border-b border-white/5 pb-2 font-Outfit">Hisob tafsilotlari</h4>
            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-Outfit">Restoran:</span>
                <span className="font-bold text-white font-Outfit truncate max-w-[150px]">{name || 'N/A'}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 font-Outfit">Reyting:</span>
                <span className="font-bold text-brand bg-brand/10 px-2.5 py-0.5 rounded-lg flex items-center gap-1 font-Outfit shadow-sm border border-brand/10">
                  <Star className="w-3 h-3 fill-current text-brand" /> {rating}
                </span>
              </div>
              <div className="border-t border-white/5 my-2"></div>
              <div className="flex flex-col gap-1.5 py-1">
                <span className="text-slate-400 font-Outfit font-semibold">Muassasa UUID:</span>
                <div className="flex items-center justify-between gap-2 bg-slate-900/50 p-2 rounded-lg border border-white/5 font-mono text-[10px] text-slate-400 select-all leading-tight">
                  <span className="truncate pr-1">{profileUuid || 'N/A'}</span>
                  {profileUuid && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(profileUuid);
                      }}
                      className="hover:text-brand transition cursor-pointer text-slate-500 hover:scale-105"
                      title="UUID nusxalash"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Floating Bottom Action Sheet for Edits */}
      {isEditing && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center z-50 px-4 pointer-events-none">
          <div className="bg-slate-950/85 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 w-full max-w-4xl pointer-events-auto animate-slide-up">
            <div className="text-left">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-brand animate-pulse" />
                Tahrirlash rejimi faol
              </h4>
              <p className="text-xs text-slate-400 mt-0.5 font-Outfit">Kiritilgan o'zgarishlarni saqlashni yoki bekor qilishni tanlang</p>
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto shrink-0">
              <button
                type="button"
                onClick={handleCancelEdits}
                className="flex-1 md:flex-none py-2.5 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold text-sm shadow-md transition duration-150 flex justify-center items-center gap-2 cursor-pointer border border-white/10 hover:border-white/20"
              >
                <X className="w-4 h-4" />
                <span>Bekor qilish</span>
              </button>
              
              <button
                type="button"
                onClick={() => {
                  const form = document.querySelector('form');
                  if (form) form.requestSubmit();
                }}
                disabled={loading}
                className="flex-1 md:flex-none py-2.5 px-6 rounded-xl bg-brand hover:bg-brand-dark text-white font-bold text-sm shadow-lg hover:shadow-brand/20 transition duration-150 flex justify-center items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    <span>Saqlash</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
