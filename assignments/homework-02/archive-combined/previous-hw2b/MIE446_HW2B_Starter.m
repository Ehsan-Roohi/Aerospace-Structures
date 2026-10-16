%% MIE 446 HW2B -- Integrate, Mix, and Trace the Load (Parts 2, 4 and 5)
% Student starter, Version 2 (October 1, 2026).
% Complete every TODO; do not replace unknowns with zero.
% Read the matching numbered steps in MIE446_HW2B_Integration_Mixing_Load_Paths.pdf.
% All calculations use SI units except control deflections, in degrees.
% Parts 2 and 4: +x forward, +y aircraft right, +z down; moments about the CG.
% Part 5: H is a given aerodynamic moment about the vane pivot; the string
% must balance it.
% Run this setup first, then use Run Section in the MATLAB Editor.
% No add-on toolbox is needed. NaN means an unfinished answer, not zero.
clear; close all; clc;
format long g;                     % retain precision when comparing with Excel
scriptFolder = fileparts(mfilename('fullpath'));
if isempty(scriptFolder), scriptFolder = pwd; end
outputFolder = fullfile(scriptFolder, 'hw2b_outputs');
if ~exist(outputFolder, 'dir'), mkdir(outputFolder); end
fprintf('Outputs will be written to: %s\n', outputFolder);

%% 0. Practice examples -- completed, not assessed data
s_demo = [0; 0.2; 0.4];             % m
f_demo = [0; 3; 6];                 % N/m
F_demo = trapz(s_demo, f_demo);     % integral is 1.2 N
fprintf('Practice trapezoid result: %.3f N\n', F_demo);
r_demo = [0.20, 0, 0];             % m; ROW vector
F_point_demo = [0, 0, 3];          % N; ROW vector
M_demo = cross(r_demo, F_point_demo);
fprintf('Practice moment: [%.3f %.3f %.3f] N m\n', M_demo);
% Expected practice moment = [0 -0.6 0] N m. Order is cross(r,F).

%% 2A. Inputs and station grid -- supplied
rho = 1.225;                       % kg/m^3
V = 15;                            % m/s; baseline speed
halfSpan = 0.450;                  % m
rootChord = 0.160; tipChord = 0.100; % m
activation = 0.300;                % m; activation station a
Az = 0.30;                         % lift-loss factor A_z, dimensionless, illustrative
Ax = 0.10;                         % drag-increase factor A_x, dimensionless, illustrative
N = 90;                            % intervals; N+1 stations
% Part 2C-1 resolution test: run once with N = 10, record, then restore N = 90.
s = linspace(0, halfSpan, N+1).';  % column vector, (N+1) by 1

%% 2B. Build the distributed force increments -- TODO
q = NaN;                           % TODO: 0.5*rho*V^2; units Pa
c = NaN(size(s));                  % TODO: chord c(s), m
g = NaN(size(s));                  % TODO: max(0,(s-activation)/(halfSpan-activation))
fz = NaN(size(s));                 % TODO: q*c*Az*g, ELEMENTWISE
fx = NaN(size(s));                 % TODO: negative q*c*Ax*g
mxDensity = NaN(size(s));          % TODO: s .* fz; units N
mzDensity = NaN(size(s));          % TODO: -s .* fx; units N
% Replace each complete RHS above. Keep semicolons to avoid 91-line dumps.
% Use .* between two vectors. Use ./ and .^ for vector division/powers.
% A scalar times a vector may use *; two station vectors need .* here.

%% 2C. Integrate and export the baseline -- TODO
Fz = NaN;                          % TODO: trapz(s,fz), N
Fx = NaN;                          % TODO: integrate fx, N
Mx = NaN;                          % TODO: integrate mxDensity, N m
Mz = NaN;                          % TODO: integrate mzDensity, N m
meanStation = NaN;                 % TODO: Mx/Fz, m (load-weighted mean station)
baseline = [Fz, Fx, Mx, Mz];
if all(isfinite([q; c; g; fz; fx; mxDensity; mzDensity])) && all(isfinite([baseline, meanStation]))
    assert(iscolumn(s) && isequal(size(s),size(c),size(g),size(fz),size(fx)), ...
        'Use equally sized column vectors for every station quantity.');
    assert(all(diff(s)>0), 'Stations must increase from root to tip.');
    assert(all(g>=0 & g<=1), 'Check activation function bounds.');
    assert(all(fz>=0) && all(fx<=0), 'Check the declared increment signs.');
    assert(meanStation>activation && meanStation<halfSpan, ...
        'The mean station must lie inside the active region; check Mx and Fz.');
    wingTable = table(s,c,g,fz,fx,mxDensity,mzDensity, 'VariableNames', ...
        {'s_m','chord_m','g','Delta_fz_N_per_m','Delta_fx_N_per_m', ...
        'roll_integrand_N','yaw_integrand_N'});
    disp(table(Fz,Fx,Mx,Mz,'VariableNames',{'DeltaFz_N','DeltaFx_N','DeltaMx_Nm','DeltaMz_Nm'}));
    fprintf('N = %d intervals. Load-weighted mean station Mx/Fz = %.4f m\n', N, meanStation);
    writetable(table(Fz,Fx,Mx,Mz,'VariableNames', ...
        {'DeltaFz_N','DeltaFx_N','DeltaMx_Nm','DeltaMz_Nm'}), ...
        fullfile(outputFolder,'Q2_baseline_totals.csv'));
    fprintf('Full-precision baseline [Fz Fx Mx Mz]: %.15g %.15g %.15g %.15g\n',baseline);
    writetable(wingTable, fullfile(outputFolder,'Q2_baseline_stations.csv'));
    figure('Color','w');
    subplot(3,1,1); plot(s,c,'k-','LineWidth',1.5); ylabel('Chord (m)'); grid on;
    subplot(3,1,2); plot(s,fz,'k-','LineWidth',1.5); ylabel('Delta f_z (N/m)'); grid on;
    subplot(3,1,3); plot(s,fx,'k-','LineWidth',1.5); ylabel('Delta f_x (N/m)');
    xlabel('Distance along right half-wing, s (m)'); grid on;
    set(findall(gcf,'-property','FontName'),'FontName','Times New Roman');
    set(findall(gcf,'Type','axes'),'XColor','k','YColor','k');
    print(gcf,fullfile(outputFolder,'Q2_spanwise_loads.png'),'-dpng','-r200');
    if N ~= 90
        fprintf(['N = %d is the resolution test. Record these four values,\n' ...
            'then restore N = 90 in Section 2A and rerun before Excel and submission.\n'], N);
    end
else
    fprintf('Q2 baseline incomplete: replace NaN entries in Sections 2B and 2C.\n');
end

%% 2D. Refine the grid -- TODO: recompute, do not reuse coarse arrays
Nfine = 180;
sFine = linspace(0,halfSpan,Nfine+1).';
cFine = NaN(size(sFine));          % TODO: same chord law on sFine
gFine = NaN(size(sFine));          % TODO: same activation law on sFine
fzFine = NaN(size(sFine));         % TODO: load law at V=15 m/s
fxFine = NaN(size(sFine));         % TODO: load law at V=15 m/s
fine = NaN(1,4);                   % TODO: [DeltaFz DeltaFx DeltaMx DeltaMz]
% Use trapz(sFine,...) four times to build fine, in the same order as baseline.
relativeChangePercent = NaN(1,4);  % TODO: 100*abs(fine-baseline)./abs(fine)
if all(isfinite([baseline, fine, relativeChangePercent]))
    convergenceTable = table({'DeltaFz_N';'DeltaFx_N';'DeltaMx_Nm';'DeltaMz_Nm'}, ...
        baseline.',fine.',relativeChangePercent.', 'VariableNames', ...
        {'Quantity',sprintf('N%d',N),'N180','Change_percent'});
    disp(convergenceTable);
    writetable(convergenceTable, fullfile(outputFolder,sprintf('Q2_convergence_N%d.csv',N)));
else
    fprintf('Q2 refinement incomplete: recompute all fine-grid arrays and four integrals.\n');
end

%% 2E. Speed study -- TODO: keep geometry, factors and the Section 2A grid fixed
speeds = [10; 15; 20];
speedResults = NaN(3,4);           % cols: [DeltaFz DeltaFx DeltaMx DeltaMz]
for j = 1:numel(speeds)
    qj = NaN;                      % TODO: dynamic pressure using speeds(j)
    fzj = NaN(size(s));            % TODO: load law using qj
    fxj = NaN(size(s));            % TODO: load law using qj
    speedResults(j,:) = NaN(1,4);  % TODO: four integrals using trapz(s,...)
end
ratioPredicted = NaN(3,1);         % TODO: (speeds/15).^2, written BEFORE running the loop
ratioComputed = NaN(3,4);          % TODO: speedResults ./ speedResults(2,:)
if all(isfinite([speedResults(:); ratioPredicted; ratioComputed(:)]))
    speedTable = array2table([speeds,speedResults,ratioPredicted,ratioComputed], 'VariableNames', ...
        {'V_m_per_s','DeltaFz_N','DeltaFx_N','DeltaMx_Nm','DeltaMz_Nm', ...
        'Predicted_ratio','Ratio_Fz','Ratio_Fx','Ratio_Mx','Ratio_Mz'});
    disp(speedTable);
    writetable(speedTable,fullfile(outputFolder,'Q2_speed_study.csv'));
else
    fprintf('Q2 speed study incomplete: complete the loop and the two ratio TODOs.\n');
end

%% 4A. Elevon mixing and limits -- TODO; positive deflection = trailing edge up
commands = [8,0; 0,5; 6,4; 10,7; -6,10]; % columns P and R in deg; five cases
nCases = size(commands,1);
limit = 15;                        % deg; symmetric actuator limit
k = 0.05;                          % N/deg, instructional force gain
rLeft = [-0.15,-0.35,0];           % m
rRight = [-0.15,0.35,0];           % m
requested = NaN(nCases,2);         % columns [left right], deg
limited = NaN(nCases,2);           % columns [left right], deg, after the limit
requestedMoments = NaN(nCases,3);  % cols [Mx My Mz], N m
limitedMoments = NaN(nCases,3);    % cols [Mx My Mz], N m
for j = 1:nCases
    P = commands(j,1); R = commands(j,2);
    requested(j,:) = NaN(1,2);     % TODO: [P-R, P+R]
    limited(j,:) = NaN(1,2);       % TODO: min(max(requested(j,:),-limit),limit)
    FLeftRequest = NaN(1,3);       % TODO: [0,0,k*requested(j,1)]
    FRightRequest = NaN(1,3);      % TODO: right counterpart
    FLeftLimited = NaN(1,3);       % TODO: use limited(j,1)
    FRightLimited = NaN(1,3);      % TODO: use limited(j,2)
    requestedMoments(j,:) = NaN(1,3); % TODO: cross(rLeft,FLeftRequest) + right term
    limitedMoments(j,:) = NaN(1,3);   % TODO: same calculation after limits
end

%% 4B. Attained command channels and plots -- TODO
Pattained = NaN(nCases,1);         % TODO: (limited(:,1)+limited(:,2))/2
Rattained = NaN(nCases,1);         % TODO: (limited(:,2)-limited(:,1))/2
if all(isfinite([requested(:);limited(:);requestedMoments(:); ...
        limitedMoments(:);Pattained;Rattained]))
    assert(all(abs(limited(:))<=limit), 'A limited deflection exceeds the limit.');
    elevonTable = array2table([commands,requested,limited,Pattained,Rattained, ...
        requestedMoments,limitedMoments], 'VariableNames', ...
        {'P_deg','R_deg','Left_request_deg','Right_request_deg', ...
        'Left_limited_deg','Right_limited_deg','P_attained_deg','R_attained_deg', ...
        'Mx_request_Nm','My_request_Nm','Mz_request_Nm', ...
        'Mx_limited_Nm','My_limited_Nm','Mz_limited_Nm'});
    disp(elevonTable);
    writetable(elevonTable,fullfile(outputFolder,'Q4_elevon_mixing.csv'));
    figure('Color','w');
    for m = 1:2
        caseIndex = 3 + m;         % Cases 4 and 5
        subplot(1,2,m);
        bars = bar([requested(caseIndex,:).',limited(caseIndex,:).'],'grouped');
        set(bars(1),'FaceColor','w','EdgeColor','k');
        set(bars(2),'FaceColor',[0.65 0.65 0.65],'EdgeColor','k');
        hold on;
        plot([0.5 2.5],[limit limit],'k--',[0.5 2.5],[-limit -limit],'k--');
        hold off;
        set(gca,'XColor','k','YColor','k','XTickLabel',{'Left','Right'});
        ylabel('Local deflection (deg), + = trailing edge up');
        title(sprintf('Case %d: actuator limits', caseIndex)); grid on;
        if m == 1, legend('Requested','After limit','Location','best'); end
    end
    set(findall(gcf,'-property','FontName'),'FontName','Times New Roman');
    print(gcf,fullfile(outputFolder,'Q4_actuator_limits.png'),'-dpng','-r200');
else
    fprintf('Q4 incomplete: fill mixer, force, cross-product and attained-channel TODOs.\n');
end

%% 5. Local mechanism moment and string tension -- TODO
H = 0.12;                          % N m; GIVEN aerodynamic moment about the vane pivot
d = [0.010;0.020;0.030];           % m; perpendicular moment arms of the string
T = NaN(size(d));                  % TODO: H ./ d, N
if all(isfinite(T))
    tensionTable = table(d,T,'VariableNames',{'Perpendicular_arm_m','String_tension_N'});
    disp(tensionTable);
    writetable(tensionTable,fullfile(outputFolder,'Q5_local_tension.csv'));
else
    fprintf('Q5 incomplete: use the local moment and the PERPENDICULAR arm, in metres.\n');
end
% The inclined-string case in Part 5B step 5 is a hand calculation.

%% Submission reminder
fprintf(['Save this completed .m file, your completed Excel workbook, and your own PDF report.\n' ...
    'Restore N = 90 in Section 2A and run from the top before submitting.\n' ...
    'Document team cross-checks and include your independently written reflection.\n' ...
    'Include the standard Claim-Evidence-Check slide (PPTX and PDF), README and AI-use note.\n' ...
    'Use Part 2 for the Engineering Judgment Record, as explained in the handout.\n' ...
    'A script that runs with unfinished NaN entries is not a completed assignment.\n']);
