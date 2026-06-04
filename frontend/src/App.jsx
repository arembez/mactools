import React, { useState, useEffect, useRef } from 'react'
import Swal from 'sweetalert2'
import './App.css'

function App() {
  const [hostname, setHostname] = useState('')
  const [desiredHostname, setDesiredHostname] = useState('')
  const [originalHostname, setOriginalHostname] = useState('')
  const [domainStatus, setDomainStatus] = useState({})
  
  const [saveEnabled, setSaveEnabled] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isJoining, setIsJoining] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState('')
  const [systemInfo, setSystemInfo] = useState({})
  
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [domainName, setDomainName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [computerName, setComputerName] = useState('')
  const [ou, setOu] = useState('')
  const [mobileAccount, setMobileAccount] = useState(true)
  const [mobileConfirm, setMobileConfirm] = useState(false)
  const [useUNCPath, setUseUNCPath] = useState(true)
  const [adminGroups, setAdminGroups] = useState('')
  const [packetSign, setPacketSign] = useState('allow')
  const [packetEncrypt, setPacketEncrypt] = useState('allow')
  const [namespace, setNamespace] = useState('forest')
  const [preferredServer, setPreferredServer] = useState('')
  const [testResults, setDomainTestResults] = useState(null)
  const [isTesting, setIsTesting] = useState(false)
  const [domainTestStatus, setDomainTestStatus] = useState('idle')
  const [showTestTooltip, setShowTestTooltip] = useState(false)
  const [showCredentials, setShowCredentials] = useState(false)
  const [showDesiredHostnamePrompt, setShowDesiredHostnamePrompt] = useState(false)

  const [adminPassword, setAdminPassword] = useState('')
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false)
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false)

  const [activeTab, setActiveTab] = useState('info')
  const [mountStatus, setMountStatus] = useState(null)
  const [isLoadingMountStatus, setIsLoadingMountStatus] = useState(false)

  const [printers, setPrinters] = useState([])
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false)
  const [printerError, setPrinterError] = useState(null)
  const [selectedPrinter, setSelectedPrinter] = useState(null)
  const [showPrinterModal, setShowPrinterModal] = useState(false)
  const [printerAction, setPrinterAction] = useState('')
  const [installedPrinters, setInstalledPrinters] = useState([])

  const domainInputRef = useRef(null)
  const testTimeoutRef = useRef(null)
  const tooltipRef = useRef(null)

  useEffect(() => {    
    loadCurrentHostname()
    loadSystemInfo()
    loadDomainStatus()
    loadConfig()
    
    return () => {
      if (testTimeoutRef.current) {
        clearTimeout(testTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target)) {
        setShowTestTooltip(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    const checkAdminAndPrompt = async () => {
      try {
        if (window.go && window.go.main && window.go.main.App) {
          const app = window.go.main.App          
          const hasAdmin = await app.CheckAdminRights()
          
          if (hasAdmin) {
            setShowAdminPasswordModal(true)
          } else {
            await Swal.fire({
              title: '⚠️ Administrator Rights Required',
              html: `
                <div style="text-align: left;">
                  <p style="margin-bottom: 1rem; font-weight: bold;">This application must be run with administrator privileges.</p>
                  <div style="background: #fff3cd; padding: 1rem; border-radius: 0.5rem; border-left: 4px solid #ffc107;">
                    <p style="margin: 0;"><strong>Please restart the application:</strong></p>
                    <ol style="margin-top: 0.5rem; margin-left: 1rem;">
                      <li>Close this application</li>
                      <li>Right-click on the application</li>
                      <li>Select "Run as Administrator"</li>
                    </ol>
                  </div>
                </div>
              `,
              icon: 'warning',
              confirmButtonText: 'Exit Application',
              showCancelButton: false,
              allowOutsideClick: false,
              allowEscapeKey: false
            }).then(async (result) => {
              if (result.isConfirmed) {
                await performExit()
              }
            })
          }
        }
      } catch (error) {
        console.error('Error checking admin status:', error)
      }
    }
    
    checkAdminAndPrompt()
  }, [])

  useEffect(() => {
    if (domainTestStatus === 'success') {
      setShowCredentials(true)
    } else {
      setShowCredentials(false)
      setUsername('')
      setPassword('')
    }
  }, [domainTestStatus])

  useEffect(() => {
    console.log('Active tab changed to:', activeTab)
    if (activeTab === 'shares') {
      loadMountStatus()
    } else if (activeTab === 'printers') {
      loadPrinters()
    }
  }, [activeTab])

  const loadMountStatus = async () => {
    setIsLoadingMountStatus(true)
    try {
      if (window.go && window.go.main && window.go.main.App) {
        const app = window.go.main.App
        const status = await app.GetMountStatus()
        setMountStatus(status)
      }
    } catch (error) {
      console.error('Error loading mount status:', error)
      setMountStatus({
        success: false,
        error: error.message
      })
    } finally {
      setIsLoadingMountStatus(false)
    }
  }

  const loadPrinters = async () => {
    setIsLoadingPrinters(true)
    setPrinterError(null)
    try {
      if (window.go && window.go.main && window.go.main.App) {
        const app = window.go.main.App
        const printers = await app.GetPrinters()        
        setPrinters(printers)
      }
    } catch (error) {
      console.error('Error loading printers:', error)
      setPrinterError(`Failed to load printers: ${error.message}`)
      setPrinters([])
    } finally {
      setIsLoadingPrinters(false)
    }
  }

  const installPrinter = async (printer) => {
    try {
      const sessionOk = await ensureSudoSession()
      if (!sessionOk) {
        showMessage('Administrator authentication required', 'warning')
        setShowAdminPasswordModal(true)
        return
      }
      
      let editableName = printer.name || ''
      let editableDescription = printer.description || ''
      let editableLocation = printer.location || ''

      const officeMatch = editableName.match(/^.+?_office(\d+)(_color)?$/i)
      if (officeMatch) {
        const colorSuffix = officeMatch[2] ? ' (цветной)' : ''
        editableName = `Офис ${officeMatch[1]}${colorSuffix}`
      }
      
      const result = await Swal.fire({
        title: 'Install Printer',
        html: `
          <div style="text-align: left;">
            <div class="form-group">
              <label class="printer">Printer Name:</label>
              <input type="text" id="printer-name" class="swal2-input printer" value="${escapeHtml(editableName)}">
            </div>
            <div class="form-group">
              <label class="printer">Description:</label>
              <input type="text" id="printer-description" class="swal2-input printer" value="${escapeHtml(editableDescription)}">
            </div>
            <div class="form-group">
              <label class="printer">Location:</label>
              <input type="text" id="printer-location" class="swal2-input printer" value="${escapeHtml(editableLocation)}">
            </div>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Install',
        cancelButtonText: 'Cancel',
        didOpen: () => {
          const nameInput = document.getElementById('printer-name')
          if (nameInput) {
            nameInput.focus()
          }
        },
        preConfirm: () => {
          const name = document.getElementById('printer-name').value
          const description = document.getElementById('printer-description').value
          const location = document.getElementById('printer-location').value
          
          if (!name || name.trim() === '') {
            Swal.showValidationMessage('Printer name is required')
            return false
          }
          
          return {
            name: name.trim(),
            description: description.trim(),
            location: location.trim()
          }
        }
      })
      
      if (result.isConfirmed) {
        const { name, description, location } = result.value
        
        const queueName = generateQueueName(name)
        
        Swal.fire({
          title: 'Installing Printer...',
          text: 'Please wait while the printer is being installed',
          allowOutsideClick: false,
          showConfirmButton: false,
          willOpen: () => {
            Swal.showLoading()
          }
        })
        
        if (window.go && window.go.main && window.go.main.App) {
          const app = window.go.main.App
          
          const modifiedPrinter = {
            ...printer,
            name: name,
            printer_name: queueName,
            description: description || name,
            location: location,
            uri: printer.uri ? printer.uri.trim() : ''
          }
          
          console.log('Installing printer:', {
            displayName: modifiedPrinter.name,
            queueName: modifiedPrinter.printer_name,
            uri: modifiedPrinter.uri
          })

          const installResult = await app.InstallPrinter(modifiedPrinter)
          await app.SetCUPSUser("BL", systemInfo.username)

          Swal.close()
          
          if (installResult.success) {
            await loadPrinters()
          } else {
            await Swal.fire({
              title: 'Installation Failed',
              html: `
                <div style="text-align: left;">
                  <p><strong>Error:</strong> ${escapeHtml(installResult.error || installResult.message)}</p>
                  <div style="margin-top: 1rem; padding: 0.5rem; background: #f8f9fa; border-radius: 0.5rem; font-size: 0.85rem;">
                    <p><strong>Printer:</strong> ${escapeHtml(name)}</p>
                    <p><strong>Queue:</strong> ${escapeHtml(queueName)}</p>
                    <p><strong>URI:</strong> ${escapeHtml(printer.uri || 'Not specified')}</p>
                  </div>
                </div>
              `,
              icon: 'error',
              confirmButtonText: 'OK'
            })
          }
        } else {
          throw new Error('Backend not available')
        }
      }
    } catch (error) {
      Swal.close()
      console.error('Error installing printer:', error)
      await Swal.fire({
        title: 'Error',
        text: `Failed to install printer: ${error.message}`,
        icon: 'error',
        confirmButtonText: 'OK'
      })
    }
  }

  const generateQueueName = (displayName) => {
    if (!displayName) return 'printer'
    
    const cyrillicMap = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
      'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
      'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '',
      'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
    }
    
    let queueName = displayName.toLowerCase()
    
    for (let [cyr, lat] of Object.entries(cyrillicMap)) {
      queueName = queueName.replace(new RegExp(cyr, 'g'), lat)
    }
    
    queueName = queueName
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
    
    if (!queueName || queueName.length === 0) {
      queueName = 'printer'
    }
    
    return queueName
  }

  const escapeHtml = (text) => {
    if (!text) return ''
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }

  const removePrinter = async (printer) => {
    try {
      const sessionOk = await ensureSudoSession()
      if (!sessionOk) {
        showMessage('Administrator authentication required', 'warning')
        setShowAdminPasswordModal(true)
        return
      }
      
      const result = await Swal.fire({
        title: 'Remove Printer',
        html: `
          <div style="text-align: left;">
            <p><strong>Printer:</strong> ${printer.name || printer.printer_name || 'Unknown'}</p>
            <p>Are you sure you want to remove this printer?</p>
            <p style="color: #dc3545; margin-top: 1rem;">This action cannot be undone.</p>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Remove',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#dc3545'
      })
      
      if (result.isConfirmed) {
        Swal.fire({
          title: 'Removing Printer...',
          text: 'Please wait while the printer is being removed',
          allowOutsideClick: false,
          showConfirmButton: false,
          willOpen: () => {
            Swal.showLoading()
          }
        })
        
        if (window.go && window.go.main && window.go.main.App) {
          const app = window.go.main.App
          const removeResult = await app.RemovePrinter(printer)
          
          Swal.close()
          
          if (removeResult.success) {
            await loadPrinters()
          } else {
            await Swal.fire({
              title: 'Removal Failed',
              text: removeResult.error || 'Failed to remove printer',
              icon: 'error',
              confirmButtonText: 'OK'
            })
          }
        } else {
          throw new Error('Backend not available')
        }
      }
    } catch (error) {
      Swal.close()
      console.error('Error removing printer:', error)
      await Swal.fire({
        title: 'Error',
        text: `Failed to remove printer: ${error.message}`,
        icon: 'error',
        confirmButtonText: 'OK'
      })
    }
  }

  const showPrinterDetails = (printer) => {
    setSelectedPrinter(printer)
    setShowPrinterModal(true)
  }

  const loadCurrentHostname = async () => {
    try {      
      if (window.go && window.go.main && window.go.main.App) {
        const app = window.go.main.App
        
        const currentHostname = await app.GetCurrentHostname()
        let desiredHostname = ''
        try {
          desiredHostname = await app.GetDesiredHostname()
        } catch (error) {
          console.log('Could not get desired hostname:', error)
        }

        setHostname(currentHostname)
        setOriginalHostname(currentHostname)
        setDesiredHostname(desiredHostname)
        setSaveEnabled(false)

        return
      } else {
        throw new Error('Internal error occurred'); 
      }      
    } catch (error) {
      console.error('Error loading hostname:', error)
      showMessage(`Error: ${error.message}`, 'error')
    }
  }

  const loadDomainStatus = async () => {
    try {
      if (window.go && window.go.main && window.go.main.App) {
        const app = window.go.main.App
        
        const status = await app.GetDomainStatus()
        setDomainStatus(status)
      }
    } catch (error) {
      console.error('Error loading domain status:', error)
    }
  }

  const loadConfig = async () => {
    try {
      if (window.go && window.go.main && window.go.main.App) {
        const app = window.go.main.App
        
        const config = await app.LoadConfig()
        if (config.domain) setDomainName(config.domain)
        if (config.username) setUsername(config.username)
        if (config.computerName) setComputerName(config.computerName)
        if (config.ou) setOu(config.ou)
        if (config.mobileAccount !== undefined) setMobileAccount(config.mobileAccount)
        if (config.mobileConfirm !== undefined) setMobileConfirm(config.mobileConfirm)
        if (config.useUNCPath !== undefined) setUseUNCPath(config.useUNCPath)
        if (config.adminGroups) setAdminGroups(config.adminGroups)
        if (config.packetSign) setPacketSign(config.packetSign)
        if (config.packetEncrypt) setPacketEncrypt(config.packetEncrypt)
        if (config.namespace) setNamespace(config.namespace)
        if (config.preferredServer) setPreferredServer(config.preferredServer)
      }
    } catch (error) {
      console.error('Error loading config:', error)
    }
  }

  const loadSystemInfo = async () => {
    try {
      if (window.go && window.go.main && window.go.main.App) {
        const app = window.go.main.App
        const info = await app.GetSystemInfo()
        setSystemInfo(info)
      }
    } catch (error) {
      console.log('Could not load system info:', error)
    }
  }

  const verifyAdminPassword = async () => {
    if (!adminPassword) {
      await Swal.fire({
        title: 'Password Required',
        text: 'Please enter your administrator password',
        icon: 'error',
        confirmButtonText: 'OK'
      })
      return false
    }

    try {
      if (window.go && window.go.main && window.go.main.App) {
        const app = window.go.main.App
        const isValid = await app.VerifyAdminPassword(adminPassword)
        
        if (isValid) {
          try {
            await app.ExtendSudoSession(adminPassword)
            console.log('Sudo session extended after authentication')
          } catch (extendError) {
            console.warn('Failed to extend sudo session:', extendError)
          }
          
          setIsAdminAuthenticated(true)
          setShowAdminPasswordModal(false)
          showMessage('Administrator authenticated successfully', 'success')
          return true
        } else {
          await Swal.fire({
            title: 'Authentication Failed',
            text: 'Incorrect password. Please try again.',
            icon: 'error',
            confirmButtonText: 'OK'
          })
          setAdminPassword('')
          return false
        }
      }
    } catch (error) {
      console.error('Error verifying password:', error)
      await Swal.fire({
        title: 'Error',
        text: `Failed to verify password: ${error.message}`,
        icon: 'error',
        confirmButtonText: 'OK'
      })
      return false
    }
    return false
  }

  const performExit = async () => {
    console.log('=== PERFORM EXIT START ===')
    console.log('Window object available:', !!window)
    console.log('window.close available:', !!window.close)
    console.log('window.go available:', !!window.go)
    console.log('window.go.main available:', !!(window.go?.main))
    console.log('window.go.main.App available:', !!(window.go?.main?.App))
    
    if (window.go?.main?.App) {
      console.log('App methods:', Object.keys(window.go.main.App))
    }
    
    try {
      if (window.runtime?.Quit) {
        console.log('Attempting window.runtime.Quit()...')
        await window.runtime.Quit()
        console.log('window.runtime.Quit() executed')
        return
      }
      
      if (window.wails?.Quit) {
        console.log('Attempting window.wails.Quit()...')
        await window.wails.Quit()
        console.log('window.wails.Quit() executed')
        return
      }
      
      if (window.go?.main?.App?.Quit) {
        console.log('Attempting window.go.main.App.Quit()...')
        await window.go.main.App.Quit()
        console.log('window.go.main.App.Quit() executed')
        return
      }
      
      if (window.close) {
        console.log('Attempting window.close()...')
        window.close()
        console.log('window.close() executed')
        
        setTimeout(() => {
          console.log('Window still open after window.close()')
          Swal.fire({
            title: 'Close Application Manually',
            html: `
              <div style="text-align: center;">
                <p>Unable to close the application automatically.</p>
                <p style="margin-top: 1rem; font-weight: bold;">Please close this window manually.</p>
              </div>
            `,
            icon: 'info',
            confirmButtonText: 'OK'
          })
        }, 500)
        return
      }
      
      console.log('No exit method available')
      Swal.fire({
        title: 'Cannot Exit Automatically',
        html: `
          <div style="text-align: center;">
            <p>No automatic exit method is available.</p>
            <p style="margin-top: 1rem; font-weight: bold;">Please close this window manually.</p>
          </div>
        `,
        icon: 'warning',
        confirmButtonText: 'OK'
      })
      
    } catch (error) {
      console.error('Error during exit:', error)
      Swal.fire({
        title: 'Error',
        text: `Failed to exit: ${error.message}`,
        icon: 'error',
        confirmButtonText: 'OK'
      })
    }
    
    console.log('=== PERFORM EXIT END ===')
  }

  const handleExitClick = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    
    console.log('=== EXIT BUTTON CLICKED ===')
    console.log('Timestamp:', new Date().toISOString())
    
    try {
      const result = await Swal.fire({
        title: 'Exit Application?',
        text: 'Are you sure you want to exit?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Exit',
        cancelButtonText: 'Cancel',
        allowOutsideClick: false
      })
      
      console.log('Swal result:', result)
      
      if (result.isConfirmed) {
        console.log('User confirmed exit')
        setShowAdminPasswordModal(false)
        await performExit()
      } else {
        console.log('Exit cancelled by user')
      }
    } catch (error) {
      console.error('Error in exit handler:', error)
    }
  }

  const ensureSudoSession = async () => {
    try {
      if (window.go && window.go.main && window.go.main.App) {
        const app = window.go.main.App
        
        const hasAdmin = await app.CheckAdminRights()
        
        if (hasAdmin && isAdminAuthenticated) {
          if (!adminPassword) {
            console.warn('No admin password available for session extension')
            setShowAdminPasswordModal(true)
            return false
          }
          
          await app.ExtendSudoSession(adminPassword)
          console.log('Sudo session extended successfully')
          return true
        } else {
          console.warn('No active admin session')
          return false
        }
      }
    } catch (error) {
      console.error('Failed to extend sudo session:', error)
      setAdminPassword('')
      setShowAdminPasswordModal(true)
      return false
    }
    return false
  }

  const showMessage = (msg, type) => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => {
      setMessage('')
      setMessageType('')
    }, 5000)
  }

  const handleHostnameChange = (e) => {
    const newHostname = e.target.value
    setHostname(newHostname)
    setSaveEnabled(newHostname.trim() !== '' && newHostname.trim() !== originalHostname)
  }

  const handleHostnameFocus = () => {
    if (desiredHostname && desiredHostname.trim() !== '' && 
        hostname !== desiredHostname && originalHostname !== desiredHostname) {
      setShowDesiredHostnamePrompt(true)
    }
  }

  const handleDomainNameChange = (e) => {
    const value = e.target.value
    setDomainName(value)
    
    if (testTimeoutRef.current) {
      clearTimeout(testTimeoutRef.current)
    }
    
    if (!value.trim()) {
      setDomainTestResults(null)
      setDomainTestStatus('idle')
      setShowCredentials(false)
      return
    }
    
    setDomainTestStatus('testing')
    setDomainTestResults(null)
    setShowCredentials(false)
    
    testTimeoutRef.current = setTimeout(async () => {
      await testDomainConnectivity(value)
    }, 1000)
  }

  const applyDesiredHostname = () => {
    setHostname(desiredHostname)
    setComputerName(desiredHostname)
    setSaveEnabled(true)
    setShowDesiredHostnamePrompt(false)
    showMessage(`Hostname set to ${desiredHostname}. Click "Save Changes" to apply.`, 'info')
  }

  const dismissDesiredHostnamePrompt = () => {
    setShowDesiredHostnamePrompt(false)
  }

  const saveHostname = async () => {
    if (!saveEnabled || isSaving) return

    const newName = hostname.trim()

    setIsSaving(true)

    try {
      let result
      
      if (window.go && window.go.main && window.go.main.App) {
        const app = window.go.main.App
        result = await app.SetHostname(newName)
      } else {
        throw new Error('Go functions not available')
      }

      if (result.includes('Success')) {
        setOriginalHostname(newName)
        setSaveEnabled(false)
        showMessage(result, 'success')
      } else {
        showMessage(result, 'error')
      }
    } catch (error) {
      console.error('Save error:', error)
      showMessage(`Error: ${error.message}`, 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const refreshHostname = async () => {
    await loadCurrentHostname()
    await loadDomainStatus()
  }

  const testDomainConnectivity = async (domainToTest = null) => {
    const domain = domainToTest || domainName
    if (!domain || !domain.trim()) {
      setDomainTestStatus('idle')
      return
    }

    setIsTesting(true)
    setDomainTestStatus('testing')

    try {
      if (window.go && window.go.main && window.go.main.App) {
        const app = window.go.main.App
        const results = await app.TestADConnectivity(domain)
        setDomainTestResults(results)
        
        if (results.dns && results.ldap) {
          setDomainTestStatus('success')
        } else {
          setDomainTestStatus('error')
        }
      }
    } catch (error) {
      console.error('Test error:', error)
      setDomainTestStatus('error')
      setDomainTestResults({ dns: false, ldap: false, srv: false, message: error.message })
    } finally {
      setIsTesting(false)
    }
  }

  const showJoinDomainModal = async () => {
    if (desiredHostname && desiredHostname.trim() !== '' && 
        hostname !== desiredHostname && originalHostname !== desiredHostname) {
      setShowDesiredHostnamePrompt(true)
      return
    }
    
    setShowJoinModal(true)
  }

  const closeJoinModal = () => {
    setShowJoinModal(false)
    setDomainTestResults(null)
    setDomainTestStatus('idle')
    setShowTestTooltip(false)
    setShowCredentials(false)
    setShowAdvancedOptions(false)
    setUsername('')
    setPassword('')
    setDomainName('')
  }

  const joinDomain = async () => {
    const validationErrors = []
    if (!domainName.trim()) validationErrors.push('Domain name is required')
    if (!username.trim()) validationErrors.push('Username is required')
    if (!password.trim()) validationErrors.push('Password is required')
    
    if (validationErrors.length > 0) {
      await Swal.fire({
        title: 'Missing Information',
        html: validationErrors.map(error => `<p>• ${error}</p>`).join(''),
        icon: 'error',
        confirmButtonText: 'OK'
      })
      return
    }

    if (domainTestStatus !== 'success') {
      const testNowResult = await Swal.fire({
        title: 'Domain Connectivity',
        text: 'Domain connectivity test failed or not performed. Do you want to test connectivity before joining?',
        icon: 'warning',
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Test Now',
        denyButtonText: 'Join Anyway',
        cancelButtonText: 'Cancel',
        customClass: {
          confirmButton: 'btn btn-info',
          denyButton: 'btn btn-warning',
          cancelButton: 'btn btn-secondary'
        }
      })
      
      if (testNowResult.isConfirmed) {
        setIsTesting(true)
        try {
          const app = window.go?.main?.App
          if (app) {
            const results = await app.TestADConnectivity(domainName)
            setDomainTestResults(results)
            
            if (results.dns && results.ldap) {
              setDomainTestStatus('success')
              await Swal.fire({
                title: 'Connectivity Test Passed',
                text: 'Domain is reachable. You can now join.',
                icon: 'success',
                confirmButtonText: 'Continue'
              })
            } else {
              setDomainTestStatus('error')
              await Swal.fire({
                title: 'Connectivity Test Failed',
                html: `
                  <div style="text-align: left;">
                    <p>Failed to connect to domain:</p>
                    <ul>
                      ${!results.dns ? '<li>DNS resolution failed</li>' : ''}
                      ${!results.ldap ? '<li>LDAP connection failed</li>' : ''}
                      ${!results.srv ? '<li>SRV records not found</li>' : ''}
                    </ul>
                  </div>
                `,
                icon: 'error',
                confirmButtonText: 'OK'
              })
              setIsTesting(false)
              return
            }
          }
        } catch (error) {
          await Swal.fire({
            title: 'Test Failed',
            text: error.message,
            icon: 'error',
            confirmButtonText: 'OK'
          })
          setIsTesting(false)
          return
        } finally {
          setIsTesting(false)
        }
      } else if (testNowResult.isDenied) {
        const proceedResult = await Swal.fire({
          title: 'Warning',
          text: 'Joining without connectivity test may fail. Do you want to proceed?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Proceed',
          cancelButtonText: 'Cancel'
        })
        
        if (!proceedResult.isConfirmed) {
          return
        }
      } else {
        return
      }
    }

    const confirmResult = await Swal.fire({
      title: 'Join Domain Configuration',
      html: `
        <div style="text-align: left;">
          <h4>Domain Details:</h4>
          <div style="background: #f8f9fa; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
            <p><strong>Domain:</strong> ${domainName}</p>
            <p><strong>Computer Name:</strong> ${hostname}</p>
            <p><strong>Username:</strong> ${username}</p>
            <p><strong>Mobile Account:</strong> ${mobileAccount ? 'Yes' : 'No'}</p>
            ${mobileConfirm ? '<p><strong>Confirmation Required:</strong> Yes</p>' : ''}
            ${ou ? `<p><strong>Organizational Unit:</strong> ${ou}</p>` : ''}
          </div>
          <p>Are you sure you want to join with these settings?</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Join Domain',
      cancelButtonText: 'Edit Settings',
      reverseButtons: true,
      customClass: {
        confirmButton: 'btn btn-primary',
        cancelButton: 'btn btn-secondary'
      },
      width: '600px'
    })
    
    if (!confirmResult.isConfirmed) {
      return
    }

    Swal.fire({
      title: 'Joining Domain...',
      html: `
        <div style="margin-top: 1rem;">
          <div class="progress" style="height: 4px; background: #e9ecef; border-radius: 2px; overflow: hidden;">
            <div id="join-progress" style="height: 100%; background: #007bff; width: 0%; transition: width 0.3s;"></div>
          </div>
          <p id="join-status" style="margin-top: 1rem; font-size: 0.9rem; color: #6c757d;">Initializing...</p>
        </div>
      `,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      willOpen: () => {
        Swal.showLoading()
      },
      didOpen: () => {
        const progressBar = document.getElementById('join-progress')
        const statusText = document.getElementById('join-status')
        
        const updateProgress = (percent, status) => {
          if (progressBar) progressBar.style.width = `${percent}%`
          if (statusText) statusText.textContent = status
        }
        
        setTimeout(() => updateProgress(20, 'Validating credentials...'), 500)
        setTimeout(() => updateProgress(40, 'Connecting to domain...'), 1500)
        setTimeout(() => updateProgress(60, 'Configuring computer...'), 2500)
      }
    })

    setIsJoining(true)
    
    try {
      const config = {
        domain: domainName,
        username: username,
        password: password,
        computerName: hostname,
        ou: ou || '',
        mobileAccount: mobileAccount,
        mobileConfirm: mobileConfirm,
        useUNCPath: useUNCPath,
        adminGroups: adminGroups,
        packetSign: packetSign,
        packetEncrypt: packetEncrypt,
        namespace: namespace,
        preferredServer: preferredServer
      }

      if (window.go && window.go.main && window.go.main.App) {
        const app = window.go.main.App
        
        const result = await app.JoinDomain(config)
        
        Swal.close()
        
        if (result.success) {
          await app.SaveConfig(config)
          await Promise.all([loadDomainStatus(), loadSystemInfo()])
          closeJoinModal()
          
          await Swal.fire({
            title: '🎉 Success!',
            html: `
              <div style="text-align: left;">
                <p>${result.message}</p>
                <div style="margin-top: 1rem; padding: 1rem; background: #d4edda; border-radius: 0.5rem;">
                  <p><strong>Computer successfully joined to:</strong></p>
                  <p style="font-size: 1.2rem; font-weight: bold;">${domainName}</p>
                  <p style="margin-top: 0.5rem;">You may need to restart your computer for changes to take full effect.</p>
                </div>
              </div>
            `,
            icon: 'success',
            confirmButtonText: 'Restart Later',
            showDenyButton: true,
            denyButtonText: 'Restart Now',
            customClass: {
              confirmButton: 'btn btn-success',
              denyButton: 'btn btn-warning'
            },
            width: '600px'
          }).then((result) => {
            if (result.isDenied) {
              Swal.fire({
                title: 'Restart Computer?',
                text: 'Are you sure you want to restart now?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Restart',
                cancelButtonText: 'Later'
              }).then((restartResult) => {
                if (restartResult.isConfirmed && window.go?.main?.App) {
                  window.go.main.App.RestartComputer()
                }
              })
            }
          })
        } else {
          await Swal.fire({
            title: 'Failed to Join Domain',
            html: `
              <div style="text-align: left;">
                <p><strong>Error:</strong> ${result.message}</p>
                ${result.error ? `<p><strong>Details:</strong> ${result.error}</p>` : ''}
                <div style="margin-top: 1rem; padding: 1rem; background: #f8d7da; border-radius: 0.5rem;">
                  <p><strong>Troubleshooting steps:</strong></p>
                  <ol style="margin-left: 1rem;">
                    <li>Verify your username and password</li>
                    <li>Check network connectivity to the domain</li>
                    <li>Ensure computer name is unique in the domain</li>
                    <li>Verify you have permission to join computers to the domain</li>
                  </ol>
                </div>
              </div>
            `,
            icon: 'error',
            confirmButtonText: 'Try Again',
            showDenyButton: true,
            denyButtonText: 'Cancel',
            customClass: {
              confirmButton: 'btn btn-primary',
              denyButton: 'btn btn-secondary'
            },
            width: '700px'
          })
        }
      } else {
        throw new Error('Go functions not available')
      }
    } catch (error) {
      Swal.close()
      console.error('Join domain error:', error)
      
      await Swal.fire({
        title: 'Unexpected Error',
        html: `
          <div style="text-align: left;">
            <p>An unexpected error occurred while joining the domain:</p>
            <p><code>${error.message}</code></p>
            <div style="margin-top: 1rem; padding: 1rem; background: #fff3cd; border-radius: 0.5rem;">
              <p>Please check:</p>
              <ul>
                <li>Your internet connection</li>
                <li>That the application has necessary permissions</li>
                <li>That you entered correct domain information</li>
              </ul>
            </div>
          </div>
        `,
        icon: 'error',
        confirmButtonText: 'OK'
      })
    } finally {
      setIsJoining(false)
    }
  }

  const leaveDomain = async () => {
    const confirmResult = await Swal.fire({
      title: 'Leave Domain?',
      text: 'Are you sure you want to leave the domain?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, leave domain',
      cancelButtonText: 'Cancel',
      reverseButtons: true,
      allowOutsideClick: false,
      showClass: {
        popup: 'animate__animated animate__fadeInDown'
      },
      hideClass: {
        popup: 'animate__animated animate__fadeOutUp'
      }
    })
    
    if (!confirmResult.isConfirmed) {
      return
    }

    Swal.fire({
      title: 'Leaving Domain...',
      text: 'Please wait while we process your request',
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      willOpen: () => {
        Swal.showLoading()
      }
    })

    const { value: credentials } = await Swal.fire({
      title: 'Domain Credentials',
      html: `
        <input id="username" class="swal2-input" placeholder="Username" autofocus>
        <input id="password" type="password" class="swal2-input" placeholder="Password">
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Leave Domain',
      cancelButtonText: 'Cancel',
      allowOutsideClick: false,
      preConfirm: () => {
        const username = document.getElementById('username').value
        const password = document.getElementById('password').value
        
        if (!username || !password) {
          Swal.showValidationMessage('Please enter both username and password')
          return false
        }
        
        return { username, password }
      }
    })
    
    if (!credentials) {
      Swal.close()
      return
    }

    Swal.update({
      title: 'Processing...',
      text: 'Leaving domain, please wait'
    })

    try {
      if (window.go && window.go.main && window.go.main.App) {
        const app = window.go.main.App
        
        const result = await app.LeaveDomain(credentials.username, credentials.password)

        Swal.close()

        if (result.success) {
          await Swal.fire({
            title: 'Success!',
            text: result.message,
            icon: 'success',
            confirmButtonText: 'OK',
            timer: 3000,
            timerProgressBar: true,
            showClass: {
              popup: 'animate__animated animate__fadeInDown'
            },
            hideClass: {
              popup: 'animate__animated animate__fadeOutUp'
            },
            willClose: async () => {
              await loadDomainStatus()
            }
          })
        } else {
          let icon = 'error'
          let title = 'Error'
          let timer = null
          
          if (result.error?.includes('canceled') || result.message?.includes('canceled')) {
            icon = 'warning'
            title = 'Cancelled'
            timer = 3000
          } else if (result.error?.includes('Not joined')) {
            icon = 'info'
            title = 'Information'
            timer = 3000
          }
          
          await Swal.fire({
            title: title,
            text: result.message || result.error,
            icon: icon,
            confirmButtonText: 'OK',
            timer: timer,
            timerProgressBar: !!timer,
            showClass: {
              popup: 'animate__animated animate__fadeInDown'
            },
            hideClass: {
              popup: 'animate__animated animate__fadeOutUp'
            }
          })
        }
      }
    } catch (error) {
      Swal.close()
      
      await Swal.fire({
        title: 'Error',
        text: `Error leaving domain: ${error.message}`,
        icon: 'error',
        confirmButtonText: 'OK',
        showClass: {
          popup: 'animate__animated animate__fadeInDown'
        },
        hideClass: {
          popup: 'animate__animated animate__fadeOutUp'
        }
      })
    } finally {
      setIsLeaving(false)
    }
  }

  const toggleTestTooltip = () => {
    if (testResults) {
      setShowTestTooltip(!showTestTooltip)
    }
  }

  const handleConnectShare = async (shareType) => {
    try {
      const sessionOk = await ensureSudoSession()
      if (!sessionOk) {
        showMessage('Administrator authentication required', 'warning')
        setShowAdminPasswordModal(true)
        return
      }
      
      await Swal.fire({
        title: 'Подключение',
        text: `Подключение сетевого ресурса...`,
        icon: 'info',
        showConfirmButton: false,
        timer: 1500
      })
      
      const app = window.go.main.App
      const result = await app.MountShare(shareType) 

      await new Promise(resolve => setTimeout(resolve, 1000)) 
      await loadMountStatus()
        
      if (!mountStatus[shareType]?.mounted) {
        await new Promise(resolve => setTimeout(resolve, 2000)) 
        await loadMountStatus()
      }

      if (result && result.success) {
        showMessage('Сетевые ресурсы успешно подключены', 'success')
      } else {
        showMessage(`Ошибка подключения: ${result?.error || 'Неизвестная ошибка'}`, 'error')
      }
      
    } catch (error) {
      console.error('Error connecting shares:', error)
      showMessage(`Ошибка подключения: ${error.message}`, 'error')
    }
  }

  const handleDisconnectShare = async (shareType) => {
    try {
      const sessionOk = await ensureSudoSession()
      if (!sessionOk) {
        showMessage('Administrator authentication required', 'warning')
        setShowAdminPasswordModal(true)
        return
      }
      
      await Swal.fire({
        title: 'Отключение',
        text: `Отключение ${shareType === 'personal' ? 'личной' : shareType === 'common' ? 'общей' : 'отдела'} шары...`,
        icon: 'info',
        showConfirmButton: false,
        timer: 1500
      })
      
      showMessage(`Отключение ${shareType} шары...`, 'info')
      
      const app = window.go.main.App
      const result = await app.UnmountShare(shareType)
      
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      await loadMountStatus()
      
      if (result && result.success) {
        showMessage('Шара успешно отключена', 'success')
      } else {
        showMessage(`Ошибка отключения: ${result?.error || 'Неизвестная ошибка'}`, 'error')
      }
      
    } catch (error) {
      console.error('Error disconnecting share:', error)
      showMessage(`Ошибка отключения: ${error.message}`, 'error')
    }
  }

  const getTestResultText = () => {
    if (!testResults) return ''
    
    const results = []
    if (testResults.dns) results.push('DNS: ✓')
    else results.push('DNS: ✗')
    
    if (testResults.ldap) results.push('LDAP: ✓')
    else results.push('LDAP: ✗')
    
    if (testResults.srv) results.push('SRV: ✓')
    else results.push('SRV: ✗')
    
    return results.join(' | ')
  }

  const renderContent = () => {
    switch(activeTab) {
      case 'info':
        return (
          <>
            <div className="content-section">
              <div className="form-group">
                <label className="form-label">Computer Name</label>
                <input
                  type="text"
                  value={hostname}
                  onChange={handleHostnameChange}
                  onFocus={handleHostnameFocus}
                  className="form-input"
                  placeholder="Enter computer name"
                />
                <div className="form-hint">
                  This name will appear on the network and in Terminal.
                </div>
              </div>

              {saveEnabled && (
                <div className="form-actions">
                  <button 
                    onClick={saveHostname} 
                    disabled={isSaving}
                    className="btn btn-primary"
                  >
                    {isSaving ? (
                      <>
                        <span className="spinner"></span>
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                  <button onClick={refreshHostname} className="btn btn-secondary">
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="content-section">
              <div className="section-header">
                <h3>System Information</h3>
              </div>
              
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">macOS Version</span>
                  <span className="info-value">
                    {systemInfo.macosVersion ? (
                      <span className={parseInt(systemInfo.macosVersion) < 26 ? 'version-warning' : ''}>
                        {systemInfo.macosVersion}
                      </span>
                    ) : 'Loading...'}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Current User</span>
                  <span className="info-value">{systemInfo.username || 'Loading...'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Privileges</span>
                  <span className="info-value">
                    {systemInfo.isAdmin ? (
                      <span className="admin-badge">
                        <span className="admin-icon">👑</span>
                        Administrator
                      </span>
                    ) : (
                      <span className="user-badge">
                        <span className="user-icon">👤</span>
                        Standard User
                      </span>
                    )}
                  </span>
                </div>
                <div className="info-item">
                  <span className="info-label">Architecture</span>
                  <span className="info-value">{systemInfo.architecture || 'Loading...'}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Hostname</span>
                  <span className="info-value">{hostname || 'Loading...'}</span>
                </div>
              </div>

              {systemInfo.macosVersion && parseInt(systemInfo.macosVersion) < 26 && (
                <div className="alert alert-warning version-warning-alert">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                  <span>Your macOS version is below 26. Please update to ensure compatibility.</span>
                </div>
              )}
              
              {systemInfo.isAdmin === false && (
                <div className="alert alert-info">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <span>Some actions may require administrator privileges. You will be prompted for admin credentials when needed.</span>
                </div>
              )}
            </div>
          </>
        )
      
      case 'domain':
        return (
                      <div className="content-section">
              <div className="section-header">
                <h3>Active Directory Domain</h3>
              </div>
              
              {domainStatus.joined ? (
                <div className="domain-card domain-joined">
                  <div className="domain-status">
                    <span className="status-indicator status-success"></span>
                    <div className="domain-info">
                      <h4>Joined to domain</h4>
                      <p className="domain-name">{domainStatus.domain}</p>
                    </div>
                  </div>
                  <div className="domain-actions">
                    <button 
                      onClick={leaveDomain} 
                      disabled={isLeaving}
                      className="btn btn-danger"
                    >
                      {isLeaving ? (
                        <>
                          <span className="spinner"></span>
                          Leaving...
                        </>
                      ) : (
                        'Leave Domain'
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="domain-card domain-not-joined">
                  <div className="domain-status">
                    <span className="status-indicator status-warning"></span>
                    <div className="domain-info">
                      <h4>Not joined to domain</h4>
                      <p>Join an Active Directory domain for centralized management</p>
                    </div>
                  </div>
                  <button 
                    onClick={showJoinDomainModal}
                    className="btn btn-primary"
                  >
                    Join Domain
                  </button>
                </div>
              )}
            </div>
        )
      case 'shares':
        return (
          <div className="content-section">
            <div className="section-header">
              <h3>Network Shares Status</h3>
            </div>

            {isLoadingMountStatus ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
              </div>
            ) : mountStatus && mountStatus.success ? (
              <div className="shares-list">
                <div className={`share-row ${!mountStatus.personal?.mounted ? 'share-disconnected' : ''}`}>
                  <div className="share-name">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>Личная</span>
                  </div>
                  
                  <div className="share-action">
                    {mountStatus.personal?.mounted ? (
                      <button 
                        className="btn btn-disconnect"
                        onClick={() => handleDisconnectShare('personal')}
                      >
                        Отключить
                      </button>
                    ) : (
                      <button 
                        className="btn btn-connect"
                        onClick={() => handleConnectShare('personal')}
                      >
                        Подключить
                      </button>
                    )}
                  </div>
                </div>

                <div className={`share-row ${!mountStatus.common?.mounted ? 'share-disconnected' : ''}`}>
                  <div className="share-name">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                    </svg>
                    <span>Подразделение</span>
                  </div>
                  
                  <div className="share-action">
                    {mountStatus.common?.mounted ? (
                      <button 
                        className="btn btn-disconnect"
                        onClick={() => handleDisconnectShare('common')}
                      >
                        Отключить
                      </button>
                    ) : (
                      <button 
                        className="btn btn-connect"
                        onClick={() => handleConnectShare('common')}
                      >
                        Подключить
                      </button>
                    )}
                  </div>
                </div>

                <div className={`share-row ${!mountStatus.department?.mounted ? 'share-disconnected' : ''}`}>
                  <div className="share-name">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3h18v18H3V3z"></path>
                      <path d="M8 8h8v8H8z"></path>
                    </svg>
                    <span>Отдел</span>
                  </div>
                  
                  <div className="share-action">
                    {mountStatus.department?.mounted ? (
                      <button 
                        className="btn btn-disconnect"
                        onClick={() => handleDisconnectShare('department')}
                      >
                        Отключить
                      </button>
                    ) : (
                      <button 
                        className="btn btn-connect"
                        onClick={() => handleConnectShare('department')}
                      >
                        Подключить
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="alert alert-error">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>Не удалось загрузить статус монтирования: {mountStatus?.error || 'Неизвестная ошибка'}</span>
              </div>
            )}
          </div>
        )
      
      case 'printers':
        return (
          <div className="content-section">
            <div className="section-header">
              <h3>Printers</h3>
                <button 
                  onClick={loadPrinters}
                  className="btn-icon"
                  title="Refresh printer list"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 4v6h-6M1 20v-6h6" stroke="currentColor" fill="none"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="currentColor" fill="none"/>
                  </svg>
                </button>
            </div>

            {isLoadingPrinters ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
              </div>
            ) : printerError ? (
              <div className="alert alert-error">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{printerError}</span>
              </div>
            ) : printers.length === 0 ? (
              <div className="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <path d="M6 18L18 6M6 6l12 12"></path>
                  <circle cx="12" cy="12" r="10"></circle>
                </svg>
                <p>No printers found</p>
                <p className="empty-hint">Check CUPS server connection or try refreshing</p>
              </div>
            ) : (
              <div className="printers-list">
                {printers.map((printer, index) => (
                  <div key={index} className={`printer-card ${printer.isInstalled ? 'printer-installed' : ''}`}>
                    <div className="printer-info">
                      <div className={`printer-icon ${!printer.isInstalled ? 'notinstalled' : ''}`}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M6 9V3h12v6" stroke="currentColor" fill="none"/>
                          <rect x="4" y="9" width="16" height="12" rx="1" stroke="currentColor" fill="none"/>
                          <path d="M6 13h12" stroke="currentColor"/>
                          <path d="M8 17h8" stroke="currentColor"/>
                          <path d="M18 13v4" stroke="currentColor"/>
                          <path d="M6 17v-4" stroke="currentColor"/>
                          <circle cx="18" cy="15" r="1" fill="currentColor"/>
                          <circle cx="6" cy="15" r="1" fill="currentColor"/>
                        </svg>
                      </div>
                      <div className="printer-details">
                        <h4 className="printer-name">
                          {printer.name || printer.printer_name || 'Unknown Printer'}
                        </h4>
                        {printer.location && (
                          <p className="printer-location">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                              <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                            {printer.location}
                          </p>
                        )}
                        {printer.description && (
                          <p className="printer-description">{printer.description}</p>
                        )}
                        {printer.status && (
                          <p className={`printer-status ${printer.status.toLowerCase().includes('idle') ? 'status-success' : 'status-warning'}`}>
                            Status: {printer.status}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="printer-actions">
                      {printer.isInstalled ? (
                        <>
                          <button
                            onClick={() => showPrinterDetails(printer)}
                            className="btn btn-secondary btn-sm"
                            title="View details"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => removePrinter(printer)}
                            className="btn btn-danger btn-sm"
                            title="Remove this printer"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => installPrinter(printer)}
                          className="btn btn-primary btn-sm"
                          title="Install this printer"
                        >
                          Install
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      
      default:
        return null
    }
  }

  const PrinterDetailsModal = ({ printer, onClose }) => {
    if (!printer) return null

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Printer Details</h3>
            <button onClick={onClose} className="close-btn">&times;</button>
          </div>
          <div className="modal-body">
            <div className="printer-detail-item">
              <strong>Name:</strong>
              <span>{printer.name || printer.printer_name || 'N/A'}</span>
            </div>
            {printer.location && (
              <div className="printer-detail-item">
                <strong>Location:</strong>
                <span>{printer.location}</span>
              </div>
            )}
            {printer.description && (
              <div className="printer-detail-item">
                <strong>Description:</strong>
                <span>{printer.description}</span>
              </div>
            )}
            {printer.model && (
              <div className="printer-detail-item">
                <strong>Model:</strong>
                <span>{printer.model}</span>
              </div>
            )}
            {printer.status && (
              <div className="printer-detail-item">
                <strong>Status:</strong>
                <span className={`printer-status ${printer.status.toLowerCase().includes('idle') ? 'status-success' : 'status-warning'}`}>
                  {printer.status}
                </span>
              </div>
            )}
            {printer.uri && (
              <div className="printer-detail-item">
                <strong>URI:</strong>
                <span className="printer-uri">{printer.uri}</span>
              </div>
            )}
            {printer.driver && (
              <div className="printer-detail-item">
                <strong>Driver:</strong>
                <span>{printer.driver}</span>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button onClick={onClose} className="btn btn-secondary">Close</button>
          </div>
        </div>
      </div>
    )
  }


  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>Computer Settings</h1>
        </div>
        <nav className="sidebar-nav">
          <a 
            href="#info" 
            className={`nav-item ${activeTab === 'info' ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              setActiveTab('info')
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="21" x2="16" y2="21"></line>
              <line x1="12" y1="17" x2="12" y2="21"></line>
            </svg>
            <span>System Info</span>
          </a>
          <a 
            href="#domain" 
            className={`nav-item ${activeTab === 'domain' ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              setActiveTab('domain')
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span>Domain</span>
          </a>
          <a 
            href="#shares" 
            className={`nav-item ${activeTab === 'shares' ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              setActiveTab('shares')
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4v16h16V4H4z"></path>
              <path d="M8 8h8v8H8z"></path>
              <path d="M20 12h4M0 12h4"></path>
              <path d="M12 20v4M12 0v4"></path>
            </svg>
            <span>Shares</span>
          </a>
          <a 
            href="#printers" 
            className={`nav-item ${activeTab === 'printers' ? 'active' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              setActiveTab('printers')
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9V3h12v6" stroke="currentColor" fill="none"/>
              <rect x="4" y="9" width="16" height="12" rx="1" stroke="currentColor" fill="none"/>
              <path d="M6 13h12" stroke="currentColor"/>
              <path d="M8 17h8" stroke="currentColor"/>
              <path d="M18 13v4" stroke="currentColor"/>
              <path d="M6 17v-4" stroke="currentColor"/>
              <circle cx="18" cy="15" r="1" fill="currentColor"/>
              <circle cx="6" cy="15" r="1" fill="currentColor"/>
            </svg>
            <span>Printers</span>
          </a>
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{systemInfo.username?.charAt(0) || 'U'}</div>
            <div className="user-details">
              <div className="user-name">{systemInfo.username || 'User'}</div>
              <div className="user-role">
                {systemInfo.isAdmin ? (
                  'Administrator'
                ) : (
                  <span className="admin-request">
                    Standard User
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="main-content">
        {renderContent()}
      </div>

      <div className="alert-container">
        {message && (
          <div className={`alert alert-${messageType}`}>
            <span className="alert-icon">
              {messageType === 'success' ? '✓' : messageType === 'error' ? '✗' : 'ℹ'}
            </span>
            <span>{message}</span>
          </div>
        )}
      </div>

      {showPrinterModal && (
        <PrinterDetailsModal 
          printer={selectedPrinter} 
          onClose={() => setShowPrinterModal(false)} 
        />
      )}

      {showDesiredHostnamePrompt && (
        <div className="modal-overlay">
          <div className="modal">            
            <div className="modal-body">
              <div className="prompt-message">
                <p>The desired hostname for this computer is:</p>
                <div className="desired-hostname-display">
                  <strong>{desiredHostname}</strong>
                </div>
                <p>Would you like to use it?</p>
                <p className="prompt-hint">This is recommended before joining a domain.</p>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={dismissDesiredHostnamePrompt} 
                className="btn btn-secondary"
              >
                Keep Current
              </button>
              <button 
                onClick={applyDesiredHostname}
                className="btn btn-primary"
              >
                Set to {desiredHostname}
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminPasswordModal 
        adminPassword={adminPassword}
        setAdminPassword={setAdminPassword}
        onAuthenticate={verifyAdminPassword}
        onExit={handleExitClick}
        isVisible={showAdminPasswordModal}
      />

      {showJoinModal && (
        <div className="modal-overlay">
          <div className="modal">            
            <div className="modal-body">
              <div className="form-row">
                <div className="form-label-col">
                  <label className="form-label">Domain name</label>
                </div>
                <div className="form-input-col">
                  <div className="domain-input-container">
                    <input
                      ref={domainInputRef}
                      type="text"
                      value={domainName}
                      onChange={handleDomainNameChange}
                      className="form-input"
                      placeholder="example.local"
                    />
                    {(domainTestStatus === 'testing' || domainTestStatus === 'success' || domainTestStatus === 'error') && (
                      <div className="domain-test-indicator">
                        <div 
                          className={`test-icon-container ${domainTestStatus}`}
                          onMouseEnter={() => testResults && setShowTestTooltip(true)}
                          onMouseLeave={() => setShowTestTooltip(false)}
                          onClick={toggleTestTooltip}
                        >
                          {domainTestStatus === 'testing' && (
                            <span className="test-spinner-small"></span>
                          )}
                          {domainTestStatus === 'success' && (
                            <span className="test-success-icon">✓</span>
                          )}
                          {domainTestStatus === 'error' && (
                            <span className="test-error-icon">✗</span>
                          )}
                        </div>
                        
                        {showTestTooltip && testResults && (
                          <div className="test-tooltip" ref={tooltipRef}>
                            <div className="tooltip-content">
                              <div className="tooltip-header">Connection Test Results</div>
                              <div className="tooltip-body">
                                <div className="test-result-row">
                                  <span className="test-label">DNS:</span>
                                  <span className={`test-value ${testResults.dns ? 'success' : 'error'}`}>
                                    {testResults.dns ? '✓ Pass' : '✗ Fail'}
                                  </span>
                                </div>
                                <div className="test-result-row">
                                  <span className="test-label">LDAP:</span>
                                  <span className={`test-value ${testResults.ldap ? 'success' : 'error'}`}>
                                    {testResults.ldap ? '✓ Pass' : '✗ Fail'}
                                  </span>
                                </div>
                                <div className="test-result-row">
                                  <span className="test-label">SRV Records:</span>
                                  <span className={`test-value ${testResults.srv ? 'success' : 'error'}`}>
                                    {testResults.srv ? '✓ Pass' : '✗ Fail'}
                                  </span>
                                </div>
                                {testResults.message && (
                                  <div className="test-message">
                                    {testResults.message}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {showCredentials && (
                <>
                  <div className="section-divider">
                    <span className="section-title">Join credentials</span>
                  </div>

                  <div className="form-row">
                    <div className="form-label-col">
                      <label className="form-label">Username</label>
                    </div>
                    <div className="form-input-col">
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="form-input"
                        placeholder="username or username@domain.com"
                      />
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-label-col">
                      <label className="form-label">Password</label>
                    </div>
                    <div className="form-input-col">
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="form-input"
                        placeholder="Password"
                      />
                    </div>
                  </div>
                </>
              )}
              
              <div className="checkbox-group">
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={mobileAccount}
                    onChange={(e) => setMobileAccount(e.target.checked)}
                  />
                  <span>Create mobile account</span>
                </label>
                
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={mobileConfirm}
                    onChange={(e) => setMobileConfirm(e.target.checked)}
                  />
                  <span>Require confirmation</span>
                </label>
                
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={useUNCPath}
                    onChange={(e) => setUseUNCPath(e.target.checked)}
                  />
                  <span>Use Windows UNC path for home directory</span>
                </label>
              </div>
              
              {showAdvancedOptions && (
                <div className="advanced-options">
                  <div className="form-row">
                    <div className="form-label-col">
                      <label className="form-label">Admin Groups</label>
                    </div>
                    <div className="form-input-col">
                      <input
                        type="text"
                        value={adminGroups}
                        onChange={(e) => setAdminGroups(e.target.value)}
                        className="form-input"
                        placeholder="DOMAIN\Group1,DOMAIN\Group2"
                      />
                      <div className="form-hint">
                        Comma-separated list of AD groups with admin rights
                      </div>
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-label-col">
                      <label className="form-label">Packet Signing</label>
                    </div>
                    <div className="form-input-col">
                      <select 
                        value={packetSign} 
                        onChange={(e) => setPacketSign(e.target.value)}
                        className="form-select"
                      >
                        <option value="allow">Allow</option>
                        <option value="require">Require</option>
                        <option value="disable">Disable</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-label-col">
                      <label className="form-label">Packet Encryption</label>
                    </div>
                    <div className="form-input-col">
                      <select 
                        value={packetEncrypt} 
                        onChange={(e) => setPacketEncrypt(e.target.value)}
                        className="form-select"
                      >
                        <option value="allow">Allow</option>
                        <option value="require">Require</option>
                        <option value="disable">Disable</option>
                        <option value="ssl">SSL</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-label-col">
                      <label className="form-label">Namespace</label>
                    </div>
                    <div className="form-input-col">
                      <select 
                        value={namespace} 
                        onChange={(e) => setNamespace(e.target.value)}
                        className="form-select"
                      >
                        <option value="forest">Forest</option>
                        <option value="domain">Domain</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-label-col">
                      <label className="form-label">Preferred Server</label>
                    </div>
                    <div className="form-input-col">
                      <input
                        type="text"
                        value={preferredServer}
                        onChange={(e) => setPreferredServer(e.target.value)}
                        className="form-input"
                        placeholder="dc01.example.local"
                      />
                      <div className="form-hint">
                        Optional - specific domain controller
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button onClick={closeJoinModal} className="btn btn-secondary">
                Cancel
              </button>
              <button 
                onClick={joinDomain} 
                disabled={isJoining || !domainName || !username || !password || domainTestStatus !== 'success'}
                className="btn btn-primary"
              >
                {isJoining ? (
                  <>
                    <span className="spinner"></span>
                    Joining...
                  </>
                ) : (
                  'Join Domain'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const AdminPasswordModal = ({ 
  adminPassword, 
  setAdminPassword, 
  onAuthenticate, 
  onExit,
  isVisible 
}) => {
  const inputRef = useRef(null)

  useEffect(() => {
    if (isVisible && inputRef.current) {
      setTimeout(() => {
        inputRef.current.focus()
      }, 100)
    }
  }, [isVisible])

  if (!isVisible) return null

  return (
    <div className="modal-overlay" onClick={(e) => e.stopPropagation()}>
      <div className="modal" style={{ maxWidth: '450px' }} onClick={(e) => e.stopPropagation()}>                    
        <div className="modal-body">
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <p style={{ marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Please enter your password
            </p>
            <p style={{ fontSize: '0.9rem', color: '#666' }}>
              Your password is used only for this session
            </p>
          </div>
          
          <div className="form-row">
            <div className="form-input-col" style={{ width: '100%', marginLeft: 0 }}>
              <input
                ref={inputRef}
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="form-input"
                placeholder="Enter your password"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    onAuthenticate()
                  }
                }}
              />
              <div className="form-hint">
                Password is never stored and only used for privileged operations
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onExit}
            className="btn btn-danger"
            style={{ 
              backgroundColor: '#dc3545',
              borderColor: '#dc3545'
            }}
          >
            Exit Application
          </button>
          <button 
            onClick={onAuthenticate}
            className="btn btn-primary"
            disabled={!adminPassword.trim()}
          >
            Authenticate
          </button>
        </div>
      </div>
    </div>
  )
}

export default App