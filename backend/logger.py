# filepath: backend/logger.py
import logging
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional

class LoggerConfig:
    """Merkezi loglama yapılandırması"""
    
    _instance = None
    _logger = None
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, log_dir: str = "logs", level: int = logging.INFO):
        if self._logger is not None:
            return  # Already initialized
            
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(exist_ok=True)
        
        # Create logger
        self._logger = logging.getLogger("azolla_backend")
        self._logger.setLevel(level)
        
        # Clear existing handlers
        self._logger.handlers.clear()
        
        # Console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(level)
        console_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        console_handler.setFormatter(console_formatter)
        self._logger.addHandler(console_handler)
        
        # File handler for all logs
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        file_handler = logging.FileHandler(self.log_dir / f"azolla_{timestamp}.log", encoding='utf-8')
        file_handler.setLevel(level)
        file_formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(funcName)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        file_handler.setFormatter(file_formatter)
        self._logger.addHandler(file_handler)
        
        # Error-only file handler
        error_handler = logging.FileHandler(self.log_dir / f"errors_{timestamp}.log", encoding='utf-8')
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(file_formatter)
        self._logger.addHandler(error_handler)
        
        self._logger.info("Logger initialized successfully")
    
    @property
    def logger(self) -> logging.Logger:
        return self._logger
    
    def get_logger(self, name: Optional[str] = None) -> logging.Logger:
        """İsimli bir logger döndür"""
        if name:
            child_logger = logging.getLogger(f"azolla_backend.{name}")
            child_logger.setLevel(self._logger.level)
            # Add handlers to child logger if needed
            if not child_logger.handlers:
                for handler in self._logger.handlers:
                    child_logger.addHandler(handler)
            return child_logger
        return self._logger

# Global logger instance
logger_config = LoggerConfig()

def get_logger(name: Optional[str] = None) -> logging.Logger:
    """Global logger erişim fonksiyonu"""
    return logger_config.get_logger(name)
