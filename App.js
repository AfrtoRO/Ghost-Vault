import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, StatusBar, Modal, KeyboardAvoidingView, Platform,
  Animated, AppState, Keyboard, Image, Dimensions, ActivityIndicator, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { WebView } from 'react-native-webview';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { Video, ResizeMode } from 'expo-av';
import * as LocalAuthentication from 'expo-local-authentication';
import * as MediaLibrary from 'expo-media-library';

const { width, height } = Dimensions.get('window');

const COLORS = {
  bg: '#1C1C1E', card: '#2C2C2E', input: '#2C2C2E',
  primary: '#3A5AFE', primaryLight: '#3A5AFE20',
  accent: '#00D1FF', text: '#FFFFFF', subText: '#8B949E',
  border: '#3A3A3C', danger: '#FF4757', success: '#2ED573', warning: '#FFA502',
  vaultPrimary: '#5D3FD3', vaultBg: '#000000', vaultCard: '#121212', vaultBorder: '#1A1A1A'
};

const ENCRYPT_KEY = 11;
const encryptData = (dataObj) => JSON.stringify(dataObj).split('').map(c => (c.charCodeAt(0) + ENCRYPT_KEY).toString(16)).join('-');
const decryptData = (encryptedStr) => {
  try { return JSON.parse(encryptedStr.split('-').map(h => String.fromCharCode(parseInt(h, 16) - ENCRYPT_KEY)).join('')); }
  catch (e) { return []; }
};

const generateSecureName = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({length: 32}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const formatTime = (millis) => {
  if (!millis) return '00:00';
  const totalSeconds = Math.floor(millis / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

const formatDateObj = (ts) => {
  if (!ts) return { date: '', time: '' };
  const d = new Date(ts);
  return {
    date: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
    time: `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`
  };
};

// مشغل الميديا المطور (تيك توك ستايل + إخفاء الأزرار + التاريخ/الوقت)
const SecureMediaViewer = ({ initialMedia, allMedia, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(allMedia.findIndex(m => m.id === initialMedia.id));
  const flatListRef = useRef(null);

  const renderItem = ({ item, index }) => {
    return (
      <MediaItem 
        item={item} 
        isActive={index === currentIndex} 
        onClose={onClose} 
      />
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FlatList
        ref={flatListRef}
        data={allMedia}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        initialScrollIndex={currentIndex}
        onMomentumScrollEnd={(e) => {
          const newIndex = Math.round(e.nativeEvent.contentOffset.y / height);
          setCurrentIndex(newIndex);
        }}
        getItemLayout={(data, index) => ({ length: height, offset: height * index, index })}
      />
    </View>
  );
};

const MediaItem = ({ item, isActive, onClose }) => {
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState({});
  const videoRef = useRef(null);
  const { date, time } = formatDateObj(item.timestamp || Date.now());
  const [barWidth, setBarWidth] = useState(0);

  // إخفاء الأزرار عند الضغط
  const toggleControls = () => setShowControls(!showControls);

  const handleProgressBarPress = (e) => {
    if (barWidth > 0 && status.durationMillis) {
      const percentage = e.nativeEvent.locationX / barWidth;
      videoRef.current.setPositionAsync(percentage * status.durationMillis);
    }
  };

  return (
    <View style={{ width, height, backgroundColor: '#000', justifyContent: 'center' }}>
      <TouchableOpacity activeOpacity={1} onPress={toggleControls} style={StyleSheet.absoluteFillObject}>
        {item.type === 'image' ? (
          <Image source={{ uri: item.uri }} style={{ flex: 1 }} resizeMode="contain" />
        ) : (
          <Video
            ref={videoRef}
            source={{ uri: item.uri }}
            style={{ flex: 1 }}
            useNativeControls={false}
            resizeMode={ResizeMode.CONTAIN} // سيملأ الشاشة عند التدوير بناءً على الأبعاد
            shouldPlay={isActive && isPlaying}
            isMuted={isMuted}
            isLooping
            onPlaybackStatusUpdate={setStatus}
          />
        )}
      </TouchableOpacity>

      {showControls && (
        <>
          {/* شريط التاريخ والوقت (اليسار تاريخ - اليمين وقت) */}
          <View style={styles.mediaHeader}>
            <Text style={styles.mediaHeaderText}>{date}</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 10 }}>
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.mediaHeaderText}>{time}</Text>
          </View>

          {/* أزرار التحكم السفلية للفيديو */}
          {item.type === 'video' && (
             <View style={styles.customVideoControls}>
                <View style={styles.progressContainer}>
                  <Text style={styles.timeText}>{formatTime(status.positionMillis)}</Text>
                  <TouchableOpacity 
                    activeOpacity={0.9} 
                    onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)} 
                    onPress={handleProgressBarPress} 
                    style={styles.progressBarBg}
                  >
                    <View style={[styles.progressBarFill, { width: `${status.durationMillis ? (status.positionMillis / status.durationMillis) * 100 : 0}%` }]} />
                  </TouchableOpacity>
                  <Text style={styles.timeText}>{formatTime(status.durationMillis)}</Text>
                </View>
                <View style={styles.controlsRow}>
                  <TouchableOpacity onPress={() => setIsMuted(!isMuted)}>
                    <Ionicons name={isMuted ? "volume-mute" : "volume-high"} size={28} color="#FFF" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setIsPlaying(!isPlaying)}>
                    <Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={50} color="#FFF" />
                  </TouchableOpacity>
                  <View style={{ width: 28 }} /> 
                </View>
             </View>
          )}
        </>
      )}
    </View>
  );
};
export default function CovertVaultFull() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isDecoyApp, setIsDecoyApp] = useState(false);
  const [fakeLoading, setFakeLoading] = useState(false);
  const [authInput, setAuthInput] = useState('');
  const [passInput, setPassInput] = useState('');
  
  const [links, setLinks] = useState([]);
  const [media, setMedia] = useState([]);
  const [vaultTab, setVaultTab] = useState('links');
  const [activeUrl, setActiveUrl] = useState(null);
  const [activeMedia, setActiveMedia] = useState(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editLinkId, setEditLinkId] = useState(null); // للتعرف على وضع التعديل
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [privacyType, setPrivacyType] = useState('visible');
  const [iconType, setIconType] = useState('auto');
  const [customIconUri, setCustomIconUri] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);

  const [decoyTab, setDecoyTab] = useState('home');
  const [decoyUser, setDecoyUser] = useState(null);
  
  const [showSignUp, setShowSignUp] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [signUpData, setSignUpData] = useState({ name: '', email: '', password: '', confirm: '' });

  const [vidUrlInput, setVidUrlInput] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const [appState, setAppState] = useState(AppState.currentState);
  const [showPrivacyBlur, setShowPrivacyBlur] = useState(false);

  const shakeAnim = useRef(new Animated.Value(0)).current;
  const tabAnim = useRef(new Animated.Value(0)).current;
  
  const [toastData, setToastData] = useState({ visible: false, type: 'info', title: '', msg: '' });
  const toastAnim = useRef(new Animated.Value(width)).current;
  const progressAnim = useRef(new Animated.Value(100)).current;

  const webViewMuteJS = `
    setInterval(function() {
      var mediaElements = document.querySelectorAll('video, audio');
      mediaElements.forEach(function(el) { el.muted = true; });
    }, 500);
    true;
  `;

  useEffect(() => {
    loadEncryptedData();
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') setShowPrivacyBlur(false);
      else if (nextAppState.match(/inactive|background/)) setShowPrivacyBlur(true);
      setAppState(nextAppState);
    });
    return () => subscription.remove();
  }, [appState]);

  useEffect(() => {
    if (isDecoyApp) {
      Animated.spring(tabAnim, { toValue: 1, friction: 5, tension: 40, useNativeDriver: true }).start();
    }
  }, [decoyTab, isDecoyApp]);

  const showToast = (type, title, msg) => {
    setToastData({ visible: true, type, title, msg });
    Animated.spring(toastAnim, { toValue: 0, friction: 8, tension: 40, useNativeDriver: true }).start();
    progressAnim.setValue(100);
    Animated.timing(progressAnim, { toValue: 0, duration: 2500, useNativeDriver: false }).start(() => {
      Animated.timing(toastAnim, { toValue: width, duration: 300, useNativeDriver: true }).start(() => {
        setToastData({ visible: false, type: 'info', title: '', msg: '' });
      });
    });
  };

  const loadEncryptedData = async () => {
    const savedLinks = await AsyncStorage.getItem('cv_links_master');
    const savedMedia = await AsyncStorage.getItem('cv_media_master');
    if (savedLinks) setLinks(decryptData(savedLinks));
    if (savedMedia) {
      const parsedMedia = decryptData(savedMedia);
      // حل مشكلة المسارات وتحديث التطبيق
      const fixedMedia = parsedMedia.map(m => {
        const fileName = m.fileName || m.uri.split('/').pop();
        return { ...m, fileName, uri: FileSystem.documentDirectory + fileName };
      });
      setMedia(fixedMedia);
    }
  };

  const saveEncryptedLinks = async (data) => { setLinks(data); await AsyncStorage.setItem('cv_links_master', encryptData(data)); };
  const saveEncryptedMedia = async (data) => { setMedia(data); await AsyncStorage.setItem('cv_media_master', encryptData(data)); };

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true })
    ]).start();
  };

  const getExactPINs = () => {
    const now = new Date();
    const h = now.getHours(); const m = now.getMinutes();
    const h12 = h % 12 || 12;
    const padM = m < 10 ? '0' + m : m; const padH = h < 10 ? '0' + h : h;
    return [`${h12}${padM}`, `${h}${padM}`, `${padH}${padM}`];
  };

  const authenticateBiometrics = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) { grantAccess(); return; }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Verify Identity', disableDeviceFallback: true, cancelLabel: 'Cancel' });
      if (result.success) grantAccess();
    } catch (e) { grantAccess(); }
  };

  const grantAccess = async () => { setIsLoggedIn(true); setAuthInput(''); setPassInput(''); };

  const handleAuthChange = (text) => {
    setAuthInput(text);
    const validPins = getExactPINs();
    if (validPins.includes(text)) { Keyboard.dismiss(); authenticateBiometrics(); }
  };

  const handleDecoyLogin = () => {
    Keyboard.dismiss();
    if (!authInput.trim() || !passInput.trim()) { triggerShake(); return; }
    setFakeLoading(true);
    setTimeout(() => {
      setFakeLoading(false);
      setDecoyUser({ email: authInput, name: authInput.split('@')[0] });
      setIsDecoyApp(true); setDecoyTab('home'); setAuthInput(''); setPassInput('');
    }, 1500);
  };

  const handleDecoySignUp = () => {
    Keyboard.dismiss();
    const { name, email, password, confirm } = signUpData;
    if (!name || !email || !password || !confirm || password !== confirm) { showToast('warning', 'Error', 'Invalid data.'); return; }
    setFakeLoading(true);
    setTimeout(() => {
      setFakeLoading(false); setDecoyUser({ email, name }); setIsDecoyApp(true);
      setDecoyTab('home'); setShowSignUp(false); setSignUpData({ name: '', email: '', password: '', confirm: '' });
    }, 2000);
  };

  const handleDecoyForgot = () => {
    Keyboard.dismiss(); setFakeLoading(true);
    setTimeout(() => { setFakeLoading(false); setShowForgot(false); showToast('success', 'Sent', 'Instructions sent.'); }, 1500);
  };

  const handleDecoyLogout = () => { setIsDecoyApp(false); setDecoyUser(null); setAuthInput(''); setPassInput(''); };

  const downloadVideoUrl = async () => {
    if (!vidUrlInput.trim()) return;
    Keyboard.dismiss(); setIsDownloading(true); setDownloadProgress(0);
    try {
      const ext = vidUrlInput.split('.').pop().split('?')[0] || 'mp4';
      const secureName = `${generateSecureName()}.${ext}`;
      const securePath = FileSystem.documentDirectory + secureName;

      const downloadResumable = FileSystem.createDownloadResumable(vidUrlInput, securePath, {}, (dp) => {
        setDownloadProgress(Math.floor((dp.totalBytesWritten / dp.totalBytesExpectedToWrite) * 100));
      });
      const result = await downloadResumable.downloadAsync();
      if (result && result.uri) {
        const newItem = { id: Date.now().toString(), fileName: secureName, uri: securePath, type: 'video', isFav: false, title: 'Intercepted Stream', timestamp: Date.now() };
        saveEncryptedMedia([newItem, ...media]);
        showToast('success', 'Secured', 'Stream saved to vault.');
      }
    } catch (error) { showToast('danger', 'Failed', 'Stream unavailable.'); } 
    finally { setIsDownloading(false); setVidUrlInput(''); }
  };

  const pickMediaSecurely = async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') return;
      let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, allowsEditing: false, allowsMultipleSelection: true, quality: 1 });
      if (!result.canceled && result.assets.length > 0) {
        const newItems = [];
        for (const asset of result.assets) {
          const isVideo = asset.type === 'video';
          const originalExt = asset.uri.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
          const secureName = `${generateSecureName()}.${originalExt}`;
          const securePath = FileSystem.documentDirectory + secureName;
          await FileSystem.copyAsync({ from: asset.uri, to: securePath });
          newItems.push({ id: Date.now().toString() + Math.random().toString(), fileName: secureName, uri: securePath, type: isVideo ? 'video' : 'image', isFav: false, title: `Secured Asset`, timestamp: Date.now() });
        }
        saveEncryptedMedia([...newItems, ...media]);
        showToast('success', 'Encrypted', `${newItems.length} asset(s) secured.`);
      }
    } catch (error) { showToast('danger', 'Error', 'Failed to import assets.'); }
  };

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!result.canceled) { setCustomIconUri(result.assets[0].uri); setIconType('custom'); }
  };

  const openEditModal = (item) => {
    setEditLinkId(item.id); setNewTitle(item.title); setNewUrl(item.url);
    setPrivacyType(item.privacy); setIconType(item.iconType); setCustomIconUri(item.customIcon || '');
    setShowAddModal(true);
  };

  const saveLink = () => {
    if (!newTitle || !newUrl) return;
    let finalUrl = newUrl.startsWith('http') ? newUrl : 'https://' + newUrl;
    
    if (editLinkId) {
      // تعديل الرابط الحالي
      const updatedLinks = links.map(l => l.id === editLinkId ? { ...l, title: newTitle, url: finalUrl, privacy: privacyType, iconType, customIcon: customIconUri } : l);
      saveEncryptedLinks(updatedLinks);
      showToast('success', 'Updated', 'Link updated successfully.');
    } else {
      // إضافة رابط جديد
      const newItem = { id: Date.now().toString(), title: newTitle, url: finalUrl, privacy: privacyType, iconType, customIcon: customIconUri, isFav: false };
      saveEncryptedLinks([newItem, ...links]);
      showToast('success', 'Saved', 'Link encrypted successfully.');
    }
    
    setNewTitle(''); setNewUrl(''); setPrivacyType('visible'); setIconType('auto'); setCustomIconUri(''); setEditLinkId(null);
    setShowAddModal(false);
  };

  const toggleFavorite = (type, id) => {
    if (type === 'link') saveEncryptedLinks(links.map(l => l.id === id ? { ...l, isFav: !l.isFav } : l));
    else saveEncryptedMedia(media.map(m => m.id === id ? { ...m, isFav: !m.isFav } : m));
  };

  const executeDelete = async () => {
    if (!confirmDel) return;
    if (confirmDel.type === 'link') saveEncryptedLinks(links.filter(l => l.id !== confirmDel.id));
    else {
      const target = media.find(m => m.id === confirmDel.id);
      if (target) { try { await FileSystem.deleteAsync(target.uri); } catch (e) { } }
      saveEncryptedMedia(media.filter(m => m.id !== confirmDel.id));
    }
    setConfirmDel(null);
  };

  const copyUrl = async (url) => { await Clipboard.setStringAsync(url); showToast('info', 'Copied', 'URL saved.'); };

  const renderIcon = (item) => {
    if (item.iconType === 'none') return <Ionicons name="globe-outline" size={24} color={COLORS.subText} />;
    if (item.iconType === 'custom' && item.customIcon) return <Image source={{ uri: item.customIcon }} style={{ width: 30, height: 30, borderRadius: 8 }} />;
    const domain = item.url.replace('http://', '').replace('https://', '').split('/')[0];
    return <Image source={{ uri: `https://www.google.com/s2/favicons?sz=64&domain=${domain}` }} style={{ width: 30, height: 30, borderRadius: 8 }} />;
  };

  const sortedLinks = [...links].sort((a, b) => (b.isFav ? 1 : 0) - (a.isFav ? 1 : 0));
  const sortedMedia = [...media].sort((a, b) => (b.isFav ? 1 : 0) - (a.isFav ? 1 : 0));

  const ToastComponent = () => {
    const icons = { success: 'checkmark-circle', danger: 'close-circle', warning: 'warning', info: 'information-circle' };
    const colors = { success: COLORS.success, danger: COLORS.danger, warning: COLORS.warning, info: COLORS.accent };
    return (
      <Animated.View style={[styles.sideToast, { transform: [{ translateX: toastAnim }] }]}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => setToastData({ visible: false, type: 'info', title: '', msg: '' })} style={styles.toastContent}>
          <Ionicons name={icons[toastData.type]} size={18} color={colors[toastData.type]} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={styles.toastTitle}>{toastData.title}</Text>
            <Text style={styles.toastMsg}>{toastData.msg}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // واجهات تسجيل الدخول (بتصميم مشابه للصور المرفقة)
  if (!isLoggedIn && !isDecoyApp) {
    if (showSignUp) {
      return (
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={{ padding: 25, paddingTop: 40 }}>
              <Text style={styles.authMainTitle}>Create an{'\n'}account</Text>
              <View style={{ marginTop: 40, gap: 20 }}>
                <View style={styles.authInputBox}>
                  <Ionicons name="person" size={20} color={COLORS.subText} style={{marginRight: 15}}/>
                  <TextInput style={styles.authInput} placeholder="Username or Email" placeholderTextColor={COLORS.subText} keyboardAppearance="dark" value={signUpData.email} onChangeText={(t) => setSignUpData({ ...signUpData, email: t })} />
                </View>
                <View style={styles.authInputBox}>
                  <Ionicons name="lock-closed" size={20} color={COLORS.subText} style={{marginRight: 15}}/>
                  <TextInput style={styles.authInput} placeholder="Password" placeholderTextColor={COLORS.subText} secureTextEntry keyboardAppearance="dark" value={signUpData.password} onChangeText={(t) => setSignUpData({ ...signUpData, password: t })} />
                  <Ionicons name="eye-outline" size={20} color={COLORS.subText} />
                </View>
                <View style={styles.authInputBox}>
                  <Ionicons name="lock-closed" size={20} color={COLORS.subText} style={{marginRight: 15}}/>
                  <TextInput style={styles.authInput} placeholder="Confirm Password" placeholderTextColor={COLORS.subText} secureTextEntry keyboardAppearance="dark" value={signUpData.confirm} onChangeText={(t) => setSignUpData({ ...signUpData, confirm: t })} />
                  <Ionicons name="eye-outline" size={20} color={COLORS.subText} />
                </View>
                <Text style={{color: COLORS.subText, fontSize: 11, marginTop: 10}}>By clicking the Register button, you agree to the public offer.</Text>
                
                <View style={styles.authActionRow}>
                  <Text style={styles.authActionText}>Register</Text>
                  <TouchableOpacity style={styles.authActionBtn} onPress={handleDecoySignUp}>
                    {fakeLoading ? <ActivityIndicator color="#FFF" /> : <Ionicons name="arrow-forward" size={24} color="#FFF" />}
                  </TouchableOpacity>
                </View>

                <View style={styles.socialBox}>
                  <Text style={{color: COLORS.subText, fontSize: 12, marginBottom: 15}}>sign up with</Text>
                  <View style={{flexDirection: 'row', gap: 15}}>
                    <TouchableOpacity style={styles.socialBtn}><Ionicons name="logo-google" size={20} color="#EA4335" /></TouchableOpacity>
                    <TouchableOpacity style={styles.socialBtn}><Ionicons name="logo-apple" size={20} color="#FFF" /></TouchableOpacity>
                    <TouchableOpacity style={styles.socialBtn}><Ionicons name="logo-facebook" size={20} color="#1877F2" /></TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity style={{alignSelf: 'center', marginTop: 40}} onPress={() => setShowSignUp(false)}>
                  <Text style={{color: COLORS.subText, fontSize: 13}}>Back</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
            <ToastComponent />
          </SafeAreaView>
        </View>
      );
    }

    if (showForgot) {
      return (
        <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
          <SafeAreaView style={styles.safeArea}>
            <View style={{ padding: 25, paddingTop: 60 }}>
              <Text style={styles.authMainTitle}>Forgot{'\n'}password?</Text>
              <View style={{ marginTop: 40 }}>
                <View style={styles.authInputBox}>
                  <Ionicons name="mail" size={20} color={COLORS.subText} style={{marginRight: 15}}/>
                  <TextInput style={styles.authInput} placeholder="Enter your email address" placeholderTextColor={COLORS.subText} autoCapitalize="none" keyboardAppearance="dark" value={authInput} onChangeText={setAuthInput} />
                </View>
                <Text style={{color: COLORS.subText, fontSize: 11, marginTop: 15}}>* We will send you a message to set or reset your new password</Text>
                
                <View style={[styles.authActionRow, {marginTop: 40}]}>
                  <Text style={styles.authActionText}>Send code</Text>
                  <TouchableOpacity style={styles.authActionBtn} onPress={handleDecoyForgot}>
                    {fakeLoading ? <ActivityIndicator color="#FFF" /> : <Ionicons name="arrow-forward" size={24} color="#FFF" />}
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={{alignSelf: 'center', marginTop: 100}} onPress={() => setShowForgot(false)}>
                  <Text style={{color: COLORS.subText, fontSize: 13}}>Back</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ToastComponent />
          </SafeAreaView>
        </View>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Animated.View style={{ flex: 1, padding: 25, paddingTop: 60, transform: [{ translateX: shakeAnim }] }}>
              <Text style={styles.authMainTitle}>Welcome{'\n'}Back!</Text>
              <View style={{ marginTop: 50, gap: 20 }}>
                <View style={styles.authInputBox}>
                  <Ionicons name="person" size={20} color={COLORS.subText} style={{marginRight: 15}}/>
                  <TextInput style={styles.authInput} placeholder="Username or Email" placeholderTextColor={COLORS.subText} value={authInput} onChangeText={handleAuthChange} autoCapitalize="none" keyboardAppearance="dark" />
                </View>
                <View style={styles.authInputBox}>
                  <Ionicons name="lock-closed" size={20} color={COLORS.subText} style={{marginRight: 15}}/>
                  <TextInput style={styles.authInput} placeholder="Password" placeholderTextColor={COLORS.subText} secureTextEntry value={passInput} onChangeText={setPassInput} keyboardAppearance="dark" />
                  <Ionicons name="eye-outline" size={20} color={COLORS.subText} />
                </View>
                
                <TouchableOpacity style={{ alignSelf: 'flex-end' }} onPress={() => setShowForgot(true)}>
                  <Text style={{ color: COLORS.subText, fontSize: 12 }}>Forgot Password?</Text>
                </TouchableOpacity>

                <View style={[styles.authActionRow, {marginTop: 20}]}>
                  <Text style={styles.authActionText}>Sign In</Text>
                  <TouchableOpacity style={styles.authActionBtn} onPress={handleDecoyLogin}>
                    {fakeLoading ? <ActivityIndicator color="#FFF" /> : <Ionicons name="arrow-forward" size={24} color="#FFF" />}
                  </TouchableOpacity>
                </View>

                <View style={styles.socialBox}>
                  <Text style={{color: COLORS.subText, fontSize: 12, marginBottom: 15}}>sign in with</Text>
                  <View style={{flexDirection: 'row', gap: 15}}>
                    <TouchableOpacity style={styles.socialBtn}><Ionicons name="logo-google" size={20} color="#EA4335" /></TouchableOpacity>
                    <TouchableOpacity style={styles.socialBtn}><Ionicons name="logo-apple" size={20} color="#FFF" /></TouchableOpacity>
                    <TouchableOpacity style={styles.socialBtn}><Ionicons name="logo-facebook" size={20} color="#1877F2" /></TouchableOpacity>
                  </View>
                </View>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
          <ToastComponent />
          {showPrivacyBlur && <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />}
        </SafeAreaView>
      </View>
    );
  }

  // واجهة التطبيق الوهمي (بروفايل جديد بستايل الدارك مود)
  if (isDecoyApp) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {decoyTab === 'profile' ? (
              <Animated.View style={{ opacity: tabAnim, paddingTop: 20, paddingHorizontal: 20 }}>
                {/* Profile UI Based on Image 2 (Dark Mode) */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </View>
                <View style={styles.profileHeader}>
                   <View>
                     <Image source={{uri: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'}} style={styles.profileAvatar} />
                     <View style={styles.verifiedBadge}><Ionicons name="checkmark" size={12} color="#FFF" /></View>
                   </View>
                   <Text style={styles.profileName}>{decoyUser?.name || 'Anton Jr.'}</Text>
                   <Text style={styles.profileRole}>Creative director at @ui8.net</Text>
                   <Text style={styles.profileBio}>A designer that keens simplicity and usability</Text>
                </View>

                <View style={styles.profileActions}>
                  <TouchableOpacity style={styles.bookBtn}>
                    <Text style={styles.bookBtnTxt}>Book class</Text>
                    <View style={styles.bookBtnDivider} />
                    <Text style={styles.bookBtnTxt}>$1,300.00</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.followBtn}>
                    <Text style={styles.followBtnTxt}>Follow</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.statsRow}>
                  <View style={styles.statBox}><Text style={styles.statLabel}>Students</Text><Text style={styles.statValue}>35,789</Text></View>
                  <View style={styles.statBox}><Text style={styles.statLabel}>Content</Text><Text style={styles.statValue}>3,648</Text></View>
                  <View style={styles.statBox}><Text style={styles.statLabel}>Followers</Text><Text style={styles.statValue}>3.6m</Text></View>
                </View>

                <View style={styles.tabsRow}>
                  <TouchableOpacity style={styles.activeTab}><Text style={styles.activeTabTxt}>Courses</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.inactiveTab}><Text style={styles.inactiveTabTxt}>Source files</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.inactiveTab}><Text style={styles.inactiveTabTxt}>Discussion</Text></TouchableOpacity>
                </View>

                <View style={styles.courseCard}>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                    <View>
                      <Text style={styles.courseTitle}>Become a UX Designer</Text>
                      <Text style={styles.courseSub}>Learn the skills & get the job</Text>
                    </View>
                    <Ionicons name="heart-outline" size={24} color={COLORS.text} />
                  </View>
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 30}}>
                    <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
                      <Text style={styles.courseRating}>4.85</Text>
                      <Text style={{color: COLORS.subText, marginLeft: 5}}>★ ratings</Text>
                    </View>
                    <Text style={styles.courseTime}>48h</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={handleDecoyLogout} style={{marginTop: 30, alignSelf: 'center'}}><Text style={{color: COLORS.danger}}>Sign Out</Text></TouchableOpacity>
              </Animated.View>
            ) : (
              // باقي التابات الوهمية
              <Animated.View style={{ opacity: tabAnim, padding: 20 }}>
                 <Text style={{ color: '#FFF', fontSize: 24, fontWeight: 'bold' }}>Dashboard</Text>
                 <Text style={{ color: COLORS.subText, marginTop: 20 }}>Navigated to {decoyTab} (Demo Data)</Text>
              </Animated.View>
            )}
          </ScrollView>

          <View style={styles.decoyBottomNav}>
            {[
              { tab: 'home', icon: 'home', label: 'Home' },
              { tab: 'market', icon: 'bar-chart', label: 'Market' },
              { tab: 'wallet', icon: 'wallet', label: 'Wallet' },
              { tab: 'profile', icon: 'person', label: 'Profile' }
            ].map((item) => (
              <TouchableOpacity key={item.tab} style={styles.decoyNavItem} onPress={() => setDecoyTab(item.tab)}>
                <Ionicons name={decoyTab === item.tab ? item.icon : `${item.icon}-outline`} size={24} color={decoyTab === item.tab ? COLORS.primary : COLORS.subText} />
                <Text style={{ color: decoyTab === item.tab ? COLORS.primary : COLORS.subText, fontSize: 10, marginTop: 2 }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ToastComponent />
        </SafeAreaView>
      </View>
    );
  }

  // واجهات القبو (Vault)
  if (activeUrl) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.bg }}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.webviewHeader}>
            <TouchableOpacity onPress={() => setActiveUrl(null)} style={styles.webviewBack}><Ionicons name="close" size={24} color={COLORS.text} /><Text style={styles.webviewBackTxt}>Close</Text></TouchableOpacity>
          </View>
          <WebView source={{ uri: activeUrl }} style={{ flex: 1, backgroundColor: COLORS.bg }} injectedJavaScript={webViewMuteJS} mediaPlaybackRequiresUserAction={true} />
        </SafeAreaView>
      </View>
    );
  }

  if (activeMedia) {
    return <SecureMediaViewer initialMedia={activeMedia} allMedia={sortedMedia} onClose={() => setActiveMedia(null)} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.vaultBg }}>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={styles.vaultHeader}>
          <View>
            <Text style={styles.vaultHeaderTitle}>Ghost Vault</Text>
            <Text style={styles.vaultHeaderSub}>{vaultTab === 'links' ? links.length + ' Links' : media.length + ' Media Assets'}</Text>
          </View>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: COLORS.danger + '20', borderColor: 'transparent' }]} onPress={() => setIsLoggedIn(false)}><Ionicons name="power" size={20} color={COLORS.danger} /></TouchableOpacity>
        </View>

        <View style={styles.tabSwitcher}>
          <TouchableOpacity style={[styles.tabBtn, vaultTab === 'links' && styles.tabBtnActive]} onPress={() => setVaultTab('links')}><Text style={[styles.tabTxt, vaultTab === 'links' && { color: COLORS.text }]}>Encrypted Links</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tabBtn, vaultTab === 'media' && styles.tabBtnActive]} onPress={() => setVaultTab('media')}><Text style={[styles.tabTxt, vaultTab === 'media' && { color: COLORS.text }]}>Secure Media</Text></TouchableOpacity>
        </View>

        {/* تم إزالة TouchableWithoutFeedback لتجنب مشاكل الاسكرول */}
        <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {vaultTab === 'links' && (
            <>
              <TouchableOpacity style={[styles.coverBtn, { marginTop: 0, marginBottom: 20, backgroundColor: COLORS.vaultCard, borderWidth: 1, borderColor: COLORS.vaultBorder }]} onPress={() => {setEditLinkId(null); setShowAddModal(true);}}><Ionicons name="add-circle" size={20} color={COLORS.vaultPrimary} style={{ marginRight: 8 }} /><Text style={[styles.coverBtnTxt, { color: COLORS.vaultPrimary }]}>Secure New Link</Text></TouchableOpacity>
              {sortedLinks.map(item => (
                <View key={item.id} style={[styles.linkCard, item.isFav && { borderColor: COLORS.warning + '50', borderWidth: 1 }]}>
                  <View style={styles.linkInfo}>
                    <View style={styles.linkIconBox}>{renderIcon(item)}</View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={styles.linkTitle} numberOfLines={1}>{item.title}</Text>
                        <TouchableOpacity onPress={() => toggleFavorite('link', item.id)} style={{ padding: 5 }}><Ionicons name={item.isFav ? "star" : "star-outline"} size={20} color={item.isFav ? COLORS.warning : COLORS.subText} /></TouchableOpacity>
                      </View>
                      <Text style={[styles.linkUrl, item.privacy === 'blur' && { opacity: 0.3 }]} numberOfLines={1}>{item.privacy === 'hidden' ? '••••••••••••••••' : item.url}</Text>
                    </View>
                  </View>
                  <View style={styles.linkActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => copyUrl(item.url)}><Ionicons name="copy-outline" size={18} color={COLORS.subText} /></TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => openEditModal(item)}><Ionicons name="create-outline" size={18} color={COLORS.subText} /></TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.danger + '15', borderColor: 'transparent' }]} onPress={() => setConfirmDel({ type: 'link', id: item.id })}><Ionicons name="trash-outline" size={18} color={COLORS.danger} /></TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, { flex: 1.5, backgroundColor: COLORS.vaultPrimary + '20', borderColor: COLORS.vaultPrimary }]} onPress={() => setActiveUrl(item.url)}><Ionicons name="open-outline" size={18} color={COLORS.vaultPrimary} /><Text style={[styles.actionTxt, { color: COLORS.vaultPrimary }]}>Connect</Text></TouchableOpacity>
                  </View>
                </View>
              ))}
            </>
          )}

          {vaultTab === 'media' && (
            <>
              <View style={styles.downloaderCard}>
                <Text style={styles.downloaderTitle}>Secure Asset Importer</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 15 }}>
                  <TextInput style={[styles.input, { flex: 1, marginBottom: 0, height: 50, backgroundColor: '#050505' }]} placeholder="Direct link (.mp4)" placeholderTextColor={COLORS.border} keyboardAppearance="dark" value={vidUrlInput} onChangeText={setVidUrlInput} />
                  <TouchableOpacity style={styles.downloadBtn} onPress={downloadVideoUrl}><Ionicons name="cloud-download" size={24} color="#FFF" /></TouchableOpacity>
                </View>
                <TouchableOpacity style={{ alignSelf: 'center', marginTop: 15 }} onPress={pickMediaSecurely}><Text style={{ color: COLORS.subText, fontSize: 13, textDecorationLine: 'underline' }}>Import from Gallery</Text></TouchableOpacity>
              </View>

              <View style={styles.vidGrid}>
                {sortedMedia.map(m => (
                  <View key={m.id} style={[styles.vidWrapper, m.isFav && { borderColor: COLORS.warning, borderWidth: 1, borderRadius: 20 }]}>
                    <TouchableOpacity 
                      style={styles.vidCard} 
                      onPress={() => setActiveMedia(m)}
                      onLongPress={() => setConfirmDel({ type: 'media', id: m.id })}
                      delayLongPress={3000} // الضغط المطول لمدة 3 ثواني للحذف
                    >
                      {m.type === 'image' ? (
                         <Image source={{ uri: m.uri }} style={styles.vidThumb} resizeMode="cover" />
                      ) : (
                         <Video source={{ uri: m.uri }} style={styles.vidThumb} resizeMode="cover" shouldPlay={false} />
                      )}
                      <View style={styles.vidPlayOverlay}><Ionicons name={m.type === 'image' ? "image" : "play"} size={30} color="#FFF" /></View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.vidFavBtn} onPress={() => toggleFavorite('media', m.id)}><Ionicons name={m.isFav ? "star" : "star-outline"} size={16} color={m.isFav ? COLORS.warning : "#FFF"} /></TouchableOpacity>
                  </View>
                ))}
              </View>
            </>
          )}
          <View style={{ height: 50 }} />
        </ScrollView>

        <Modal visible={isDownloading} transparent animationType="fade">
          <View style={styles.modalOverlayCen}>
            <View style={styles.confirmCard}>
              <Ionicons name="cloud-download-outline" size={50} color={COLORS.accent} style={{ marginBottom: 15 }} />
              <Text style={styles.confirmTitle}>Intercepting...</Text>
              <View style={{ width: '100%', height: 6, backgroundColor: COLORS.border, borderRadius: 3, marginVertical: 15, overflow: 'hidden' }}><View style={{ height: '100%', width: `${downloadProgress}%`, backgroundColor: COLORS.accent }} /></View>
              <Text style={{ color: COLORS.text, fontWeight: 'bold' }}>{downloadProgress}%</Text>
            </View>
          </View>
        </Modal>

        <Modal visible={showAddModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <TouchableOpacity style={{ flex: 1 }} onPress={() => setShowAddModal(false)} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{editLinkId ? "Edit Link" : "Secure Link"}</Text>
                <TouchableOpacity onPress={() => setShowAddModal(false)}><Ionicons name="close" size={24} color={COLORS.subText} /></TouchableOpacity>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.inputLabel}>Asset Title</Text>
                <TextInput style={styles.input} placeholder="Title" placeholderTextColor={COLORS.border} keyboardAppearance="dark" value={newTitle} onChangeText={setNewTitle} />
                <Text style={styles.inputLabel}>Target URL</Text>
                <TextInput style={styles.input} placeholder="URL" placeholderTextColor={COLORS.border} autoCapitalize="none" keyboardAppearance="dark" value={newUrl} onChangeText={setNewUrl} />
                
                <Text style={styles.inputLabel}>Privacy Level</Text>
                <View style={styles.optionsRow}>
                  {['visible', 'blur', 'hidden'].map(p => (
                    <TouchableOpacity key={p} style={[styles.optionBtn, privacyType === p && styles.optionActive]} onPress={() => setPrivacyType(p)}>
                      <Text style={[styles.optionTxt, privacyType === p && { color: COLORS.text }]}>{p.charAt(0).toUpperCase() + p.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.inputLabel}>Icon Rendering</Text>
                <View style={styles.optionsRow}>
                  <TouchableOpacity style={[styles.optionBtn, iconType === 'auto' && styles.optionActive]} onPress={() => setIconType('auto')}><Text style={[styles.optionTxt, iconType === 'auto' && { color: COLORS.text }]}>Auto</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.optionBtn, iconType === 'none' && styles.optionActive]} onPress={() => setIconType('none')}><Text style={[styles.optionTxt, iconType === 'none' && { color: COLORS.text }]}>None</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.optionBtn, iconType === 'custom' && styles.optionActive]} onPress={pickImage}><Text style={[styles.optionTxt, iconType === 'custom' && { color: COLORS.text }]}>Upload</Text></TouchableOpacity>
                </View>

                {iconType === 'custom' && customIconUri ? (
                  <View style={{ alignItems: 'center', marginVertical: 10 }}><Image source={{ uri: customIconUri }} style={{ width: 60, height: 60, borderRadius: 15 }} /></View>
                ) : null}

                <TouchableOpacity style={[styles.coverBtn, { marginTop: 10, backgroundColor: COLORS.vaultPrimary }]} onPress={saveLink}><Text style={styles.coverBtnTxt}>{editLinkId ? "Save Changes" : "Encrypt"}</Text></TouchableOpacity>
                <View style={{ height: 30 }} />
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal visible={!!confirmDel} transparent animationType="fade">
          <View style={styles.modalOverlayCen}>
            <View style={styles.confirmCard}>
              <Ionicons name="warning" size={55} color={COLORS.danger} style={{ marginBottom: 15 }} />
              <Text style={styles.confirmTitle}>Purge Asset?</Text>
              <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 25 }}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmDel(null)}><Text style={styles.cancelBtnTxt}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={styles.delBtn} onPress={executeDelete}><Text style={styles.delBtnTxt}>Purge</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <ToastComponent />
        {showPrivacyBlur && <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  // Auth Styles
  authMainTitle: { fontSize: 40, fontWeight: '700', color: COLORS.text, letterSpacing: -1, lineHeight: 45 },
  authInputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 16, paddingHorizontal: 20, height: 65 },
  authInput: { flex: 1, color: COLORS.text, fontSize: 16 },
  authActionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 30 },
  authActionText: { color: COLORS.text, fontSize: 24, fontWeight: '700' },
  authActionBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  socialBox: { marginTop: 60, alignItems: 'center' },
  socialBtn: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center' },
  
  // Profile Styles (Dark Mode)
  profileHeader: { alignItems: 'center', marginTop: 20 },
  profileAvatar: { width: 100, height: 100, borderRadius: 25, backgroundColor: '#FFF' },
  verifiedBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: COLORS.primary, width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.bg },
  profileName: { fontSize: 26, fontWeight: 'bold', color: COLORS.text, marginTop: 15 },
  profileRole: { fontSize: 14, color: COLORS.subText, marginTop: 5 },
  profileBio: { fontSize: 13, color: '#A0A0A0', marginTop: 8, textAlign: 'center', paddingHorizontal: 20 },
  profileActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 15, marginTop: 25 },
  bookBtn: { flex: 1, flexDirection: 'row', backgroundColor: COLORS.primary, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  bookBtnTxt: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
  bookBtnDivider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 10 },
  followBtn: { flex: 0.6, backgroundColor: COLORS.card, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  followBtnTxt: { color: COLORS.text, fontWeight: 'bold', fontSize: 15 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 30, paddingHorizontal: 10 },
  statBox: { alignItems: 'center' },
  statLabel: { color: COLORS.subText, fontSize: 12, marginBottom: 5 },
  statValue: { color: COLORS.text, fontSize: 18, fontWeight: 'bold' },
  tabsRow: { flexDirection: 'row', marginTop: 30, backgroundColor: COLORS.card, borderRadius: 20, padding: 5 },
  activeTab: { flex: 1, backgroundColor: COLORS.bg, paddingVertical: 10, borderRadius: 15, alignItems: 'center' },
  inactiveTab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  activeTabTxt: { color: COLORS.text, fontWeight: 'bold', fontSize: 13 },
  inactiveTabTxt: { color: COLORS.subText, fontSize: 13 },
  courseCard: { backgroundColor: '#E0E5FF', borderRadius: 20, padding: 25, marginTop: 25 }, // بطاقة فاتحة للتباين حسب التصميم
  courseTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A' },
  courseSub: { fontSize: 13, color: '#666', marginTop: 5 },
  courseRating: { fontSize: 28, fontWeight: 'bold', color: '#1A1A1A' },
  courseTime: { fontSize: 14, fontWeight: 'bold', color: '#1A1A1A' },
  decoyBottomNav: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 20, backgroundColor: COLORS.bg, borderTopWidth: 1, borderColor: COLORS.border },
  decoyNavItem: { flex: 1, alignItems: 'center' },

  // Vault Core Styles
  vaultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.vaultBorder },
  vaultHeaderTitle: { fontSize: 28, fontWeight: '900', color: COLORS.text, letterSpacing: -1 },
  vaultHeaderSub: { fontSize: 14, color: COLORS.vaultPrimary, fontWeight: '800', marginTop: 2 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.vaultCard, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.vaultBorder },
  tabSwitcher: { flexDirection: 'row', marginHorizontal: 20, marginTop: 20, backgroundColor: COLORS.vaultCard, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: COLORS.vaultBorder },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  tabBtnActive: { backgroundColor: COLORS.vaultBg },
  tabTxt: { color: COLORS.subText, fontWeight: '800', fontSize: 14 },
  listContainer: { flex: 1, padding: 20 },
  linkCard: { backgroundColor: COLORS.vaultCard, borderRadius: 24, padding: 20, marginBottom: 15, borderWidth: 1, borderColor: COLORS.vaultBorder },
  linkInfo: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  linkIconBox: { width: 50, height: 50, borderRadius: 16, backgroundColor: COLORS.vaultBg, justifyContent: 'center', alignItems: 'center', marginRight: 15, borderWidth: 1, borderColor: COLORS.vaultBorder },
  linkTitle: { color: COLORS.text, fontSize: 17, fontWeight: '900', marginBottom: 4 },
  linkUrl: { color: COLORS.subText, fontSize: 13, fontWeight: '600' },
  linkActions: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  actionBtn: { flex: 0.3, flexDirection: 'row', height: 42, borderRadius: 12, backgroundColor: COLORS.vaultBg, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.vaultBorder },
  actionTxt: { fontWeight: '800', fontSize: 13, marginLeft: 6 },
  downloaderCard: { backgroundColor: COLORS.vaultCard, borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: COLORS.vaultBorder },
  downloaderTitle: { color: COLORS.text, fontSize: 16, fontWeight: '900' },
  downloadBtn: { width: 50, height: 50, borderRadius: 12, backgroundColor: COLORS.vaultPrimary, justifyContent: 'center', alignItems: 'center' },
  vidGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
  vidWrapper: { width: (width - 55) / 2, aspectRatio: 1, marginBottom: 15 },
  vidCard: { flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: COLORS.vaultCard, borderWidth: 1, borderColor: COLORS.vaultBorder },
  vidThumb: { width: '100%', height: '100%' },
  vidPlayOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  vidFavBtn: { position: 'absolute', top: 10, left: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  
  // Media Viewer Styles
  mediaHeader: { position: 'absolute', top: 50, width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, zIndex: 10 },
  mediaHeaderText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 3 },
  customVideoControls: { position: 'absolute', bottom: 40, width: '100%', paddingHorizontal: 20, zIndex: 10 },
  progressContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 10 },
  timeText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  progressBarBg: { flex: 1, height: 20, justifyContent: 'center' },
  progressBarFill: { height: 6, backgroundColor: COLORS.success, borderRadius: 3 },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10 },

  // Shared Modals and Toasts
  sideToast: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, right: 15, width: 220, backgroundColor: '#151A25', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#232B3B', zIndex: 9999 },
  toastContent: { flexDirection: 'row', alignItems: 'center', padding: 15 },
  toastTitle: { color: COLORS.text, fontSize: 13, fontWeight: 'bold' },
  toastMsg: { color: COLORS.subText, fontSize: 11, marginTop: 1 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: COLORS.vaultCard, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 30, paddingBottom: 50 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 },
  modalTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900' },
  inputLabel: { color: COLORS.subText, fontSize: 12, fontWeight: '800', marginBottom: 8, marginLeft: 5, textTransform: 'uppercase' },
  input: { width: '100%', height: 55, backgroundColor: COLORS.vaultBg, borderRadius: 16, borderWidth: 1, borderColor: COLORS.vaultBorder, color: COLORS.text, fontSize: 15, paddingHorizontal: 20, marginBottom: 20 },
  optionsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  optionBtn: { flex: 1, height: 45, backgroundColor: COLORS.vaultBg, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.vaultBorder },
  optionActive: { backgroundColor: COLORS.vaultPrimary + '20', borderColor: COLORS.vaultPrimary },
  optionTxt: { color: COLORS.subText, fontSize: 13, fontWeight: '700' },
  webviewHeader: { flexDirection: 'row', alignItems: 'center', padding: 15, paddingTop: Platform.OS === 'android' ? 40 : 15, backgroundColor: COLORS.vaultCard, borderBottomWidth: 1, borderBottomColor: COLORS.vaultBorder },
  webviewBack: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.vaultBg, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
  webviewBackTxt: { color: COLORS.text, fontSize: 14, fontWeight: '800', marginLeft: 6 },
  modalOverlayCen: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  confirmCard: { width: '100%', backgroundColor: COLORS.vaultCard, borderRadius: 28, padding: 30, alignItems: 'center', borderWidth: 1, borderColor: COLORS.vaultBorder },
  confirmTitle: { color: COLORS.text, fontSize: 22, fontWeight: '900', marginBottom: 10 },
  cancelBtn: { flex: 1, height: 55, backgroundColor: COLORS.vaultBg, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  cancelBtnTxt: { color: COLORS.text, fontWeight: '800', fontSize: 15 },
  delBtn: { flex: 1, height: 55, backgroundColor: COLORS.danger, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  delBtnTxt: { color: '#FFF', fontWeight: '800', fontSize: 15 },
  coverBtn: { height: 60, width: '100%', backgroundColor: COLORS.primary, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginTop: 30 },
  coverBtnTxt: { color: '#FFF', fontSize: 17, fontWeight: 'bold' }
});
