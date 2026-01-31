# 📊 DataLens - Data Analysis Tool

<div align="center">

![DataLens Banner](https://img.shields.io/badge/DataLens-Data%20Analysis%20Tool-6366f1?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PGVsbGlwc2UgY3g9IjEyIiBjeT0iNSIgcng9IjkiIHJ5PSIzIi8+PHBhdGggZD0iTTMgNVYxOWE5IDMgMCAwIDAgMTggMFY1Ii8+PHBhdGggZD0iTTMgMTJhOSAzIDAgMCAwIDE4IDAiLz48L3N2Zz4=)

[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.1-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-7.2-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**A comprehensive web-based data analysis tool designed for data analysts to compute statistics, calculate probabilities, and visualize data from Excel and CSV files.**

[🚀 Getting Started](#-getting-started) • [✨ Features](#-features) • [📖 Usage](#-usage) • [🛠️ Tech Stack](#️-tech-stack)

</div>

---

## 🎯 Overview

DataLens is a powerful, browser-based data analysis application that helps data analysts with their day-to-day activities. Upload your Excel (.xlsx, .xls) or CSV files and instantly access comprehensive statistical analysis, probability calculations, and beautiful data visualizations—all in one place.

### Why DataLens?

- **No Installation Required**: Works entirely in your browser
- **Privacy First**: All data processing happens locally—your data never leaves your machine
- **Instant Analysis**: Upload and analyze datasets with thousands of rows in seconds
- **User Friendly**: Clean, intuitive interface designed for productivity

---

## ✨ Features

### 📁 File Upload
- **Drag & Drop** interface for easy file uploading
- Supports **Excel** (.xlsx, .xls) and **CSV** formats
- Automatic data type detection
- Handles large datasets efficiently

### 📋 Data Table
- **Paginated view** for browsing large datasets
- **Search functionality** across all columns
- **Sortable columns** (click headers to sort ascending/descending)
- Row numbering for easy reference

### 📈 Statistical Analysis
Comprehensive per-column statistics including:

| Numeric Columns | Text Columns |
|----------------|--------------|
| Mean, Median, Mode | Most Common Value |
| Min, Max, Range | Least Common Value |
| Sum | Unique Count |
| Variance, Standard Deviation | |
| Quartiles (Q1, Q3), IQR | |
| Skewness, Kurtosis | |

Plus dataset-level summaries:
- Total rows & columns
- Missing values count & percentage
- Numeric vs. categorical column breakdown

### 🎲 Probability Calculator
Built-in calculators for:

| Calculator | Description |
|------------|-------------|
| **Basic Probability** | P(A) = Favorable / Total outcomes |
| **Combinations & Permutations** | C(n,r) and P(n,r) calculations |
| **Binomial Distribution** | P(X=k), expected value, std dev |
| **Poisson Distribution** | Event probability over intervals |
| **Normal/Z-Score** | Z-score and PDF calculations |
| **Correlation Analysis** | Pearson correlation, covariance, R² |

### 📊 Data Visualization
Create beautiful, interactive charts:

- **Bar Charts** - Compare categorical data
- **Line Charts** - Show trends over time
- **Area Charts** - Visualize cumulative data
- **Pie Charts** - Display proportions
- **Scatter Plots** - Explore relationships between variables
- **Histograms** - Understand data distribution

With aggregation options: Sum, Average, Count, Min, Max

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/datalens.git
   cd datalens
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Open your browser**
   Navigate to `http://localhost:5173`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

---

## 📖 Usage

### Quick Start

1. **Upload Your Data**
   - Drag and drop your Excel or CSV file onto the upload area
   - Or click to browse and select a file
   - Don't have a file? Click "Generate Sample Dataset" to try the app

2. **Explore Your Data**
   - Use the **Data Table** tab to browse, search, and sort your data
   - Click column headers to sort ascending/descending

3. **Analyze Statistics**
   - Navigate to the **Statistics** tab
   - View summary cards for your entire dataset
   - Click on individual columns to expand detailed statistics

4. **Calculate Probabilities**
   - Go to the **Probability** tab
   - Choose from Basic, Binomial, Poisson, Normal, or Correlation calculators
   - For Correlation, select two numeric columns from your dataset

5. **Visualize Your Data**
   - Visit the **Visualization** tab
   - Select a chart type (Bar, Line, Area, Pie, Scatter, or Histogram)
   - Choose your X-axis, Y-axis (if applicable), and aggregation method

### Sample Dataset

If you don't have a file ready, click "Generate Sample Dataset" on the Overview page. This creates a demo sales dataset with:
- 200 rows of data
- 10 columns including: ID, Product, Category, Region, Month, Sales, Quantity, Price, Rating, Stock Status

---

## 🛠️ Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 19** | UI Framework |
| **TypeScript** | Type Safety |
| **Vite** | Build Tool & Dev Server |
| **Tailwind CSS 4** | Styling |
| **Recharts** | Data Visualization |
| **SheetJS (xlsx)** | Excel/CSV Parsing |
| **Lucide React** | Icons |

---

## 📁 Project Structure

```
datalens/
├── src/
│   ├── components/
│   │   ├── DataOverview.tsx    # Home page & file upload
│   │   ├── DataTable.tsx       # Paginated data table
│   │   ├── FileUpload.tsx      # Drag & drop file upload
│   │   ├── Probability.tsx     # Probability calculators
│   │   ├── Statistics.tsx      # Statistical analysis
│   │   └── Visualization.tsx   # Charts & graphs
│   ├── context/
│   │   └── DataContext.tsx     # Global state management
│   ├── types/
│   │   └── data.ts             # TypeScript interfaces
│   ├── utils/
│   │   ├── cn.ts               # Tailwind class merger
│   │   └── statistics.ts       # Statistical functions
│   ├── App.tsx                 # Main app component
│   ├── main.tsx                # Entry point
│   └── index.css               # Global styles
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 🧮 Statistical Functions

The app includes the following statistical computations:

### Descriptive Statistics
- **Mean** - Arithmetic average
- **Median** - Middle value when sorted
- **Mode** - Most frequently occurring value
- **Variance** - Measure of data spread
- **Standard Deviation** - Square root of variance
- **Range** - Difference between max and min

### Distribution Metrics
- **Quartiles (Q1, Q3)** - 25th and 75th percentiles
- **Interquartile Range (IQR)** - Q3 - Q1
- **Skewness** - Measure of distribution asymmetry
- **Kurtosis** - Measure of distribution "tailedness"

### Probability Functions
- **Factorial** - n!
- **Combinations** - C(n,r) = n! / (r!(n-r)!)
- **Permutations** - P(n,r) = n! / (n-r)!
- **Binomial Probability** - P(X=k) for binomial distribution
- **Poisson Probability** - P(X=k) for Poisson distribution
- **Normal PDF** - Probability density function
- **Z-Score** - Standardized score
- **Correlation** - Pearson correlation coefficient
- **Covariance** - Measure of joint variability

---

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. **Commit your changes**
   ```bash
   git commit -m 'Add some AmazingFeature'
   ```
4. **Push to the branch**
   ```bash
   git push origin feature/AmazingFeature
   ```
5. **Open a Pull Request**

### Ideas for Contributions
- [ ] Export statistics to PDF/Excel
- [ ] Additional chart types (Box plots, Heatmaps)
- [ ] Data filtering and transformation
- [ ] Regression analysis
- [ ] Hypothesis testing (t-tests, chi-square)
- [ ] Multiple file comparison
- [ ] Dark mode support

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Recharts](https://recharts.org/) for the amazing charting library
- [SheetJS](https://sheetjs.com/) for Excel/CSV parsing
- [Lucide](https://lucide.dev/) for beautiful icons
- [Tailwind CSS](https://tailwindcss.com/) for utility-first styling

---

<div align="center">

**Made with ❤️ for Data Analysts**

[⬆ Back to Top](#-datalens---data-analysis-tool)

</div>
